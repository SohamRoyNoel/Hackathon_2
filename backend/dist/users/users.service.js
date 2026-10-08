"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const node_child_process_1 = require("node:child_process");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const role_schema_1 = require("../schemas/role.schema");
const user_schema_1 = require("../schemas/user.schema");
let UsersService = class UsersService {
    constructor(userModel, roleModel) {
        this.userModel = userModel;
        this.roleModel = roleModel;
    }
    async generateClaudeMessage() {
        const region = process.env.AWS_REGION ?? 'ap-south-1';
        const baseURL = process.env.BEDROCK_RUNTIME_BASE_URL ?? `https://bedrock-runtime.${region}.amazonaws.com`;
        const modelId = process.env.ANTHROPIC_MODEL ??
            process.env.BEDROCK_MODEL_ID ??
            'global.anthropic.claude-opus-4-8';
        const apiKey = process.env.AWS_BEDROCK_BEARER_TOKEN ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return 'Claude agent unavailable: BEDROCK bearer token is not set.';
        }
        const endpoint = `${baseURL.replace(/\/$/, '')}/model/${modelId}/invoke`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 64,
                messages: [
                    {
                        role: 'user',
                        content: 'Generate one concise human-readable message about a secure role scanning result. It should sound like a real security review update and be one sentence only. Do not include markdown, bullets, or extra formatting.',
                    },
                ],
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            return `Claude agent request failed: ${response.status} ${text}`;
        }
        const payload = (await response.json());
        const content = Array.isArray(payload.content) ? payload.content : [];
        const text = content
            .filter((block) => !!block && typeof block === 'object' && 'text' in block)
            .map((block) => block.text)
            .filter((value) => typeof value === 'string')
            .join('\n')
            .trim();
        if (text) {
            return text;
        }
        if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
            return payload.output_text.trim();
        }
        if (typeof payload.completion === 'string' && payload.completion.trim()) {
            return payload.completion.trim();
        }
        return JSON.stringify(payload);
    }
    async triggerPostAgentCommand(agentMessage) {
        const sshHost = process.env.POST_AGENT_SSH_HOST ?? process.env.SSH_HOST;
        const sshKeyPath = process.env.POST_AGENT_SSH_KEY_PATH ?? process.env.SSH_KEY_PATH;
        const remoteCommandTemplate = process.env.POST_AGENT_SSH_COMMAND ??
            process.env.SSH_REMOTE_COMMAND ??
            'pwd';
        if (!sshHost || !sshKeyPath) {
            return;
        }
        const safeMessage = agentMessage
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');
        const remoteCommand = remoteCommandTemplate.includes('%MESSAGE%')
            ? remoteCommandTemplate.replace(/%MESSAGE%/g, safeMessage)
            : remoteCommandTemplate;
        await new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)('ssh', [
                '-i',
                sshKeyPath,
                '-o',
                'BatchMode=yes',
                '-o',
                'ConnectTimeout=10',
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                sshHost,
                remoteCommand,
            ], { stdio: 'inherit' });
            child.on('error', reject);
            child.on('exit', (code) => {
                if (code === 0) {
                    console.log('Post-agent SSH command executed successfully.');
                    resolve();
                    return;
                }
                reject(new Error(`SSH command exited with code ${code}`));
            });
        }).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown SSH execution error';
            console.error('Post-agent SSH command failed:', message);
        });
    }
    async create(createUserDto) {
        const existingUser = await this.userModel.findOne({
            userName: createUserDto.userName,
        });
        if (existingUser) {
            return {
                message: 'user already exists',
            };
        }
        const roleEntries = await Promise.all(createUserDto.role.map(async (roleName) => {
            const existingRole = await this.roleModel.findOne({ roleName }).lean();
            if (existingRole) {
                return {
                    role: existingRole,
                    isNew: false,
                };
            }
            const createdRole = await this.roleModel.create({
                roleId: `role-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                roleName,
                isScanned: createUserDto.shouldIncludeScan,
            });
            return {
                role: createdRole,
                isNew: true,
            };
        }));
        const createdUser = await this.userModel.create({
            userName: createUserDto.userName,
            roleId: createUserDto.role,
        });
        const hasNewRole = roleEntries.some((entry) => entry.isNew);
        const shouldNotifyAgent = createUserDto.shouldIncludeScan || hasNewRole;
        const agentMessage = shouldNotifyAgent
            ? await this.generateClaudeMessage()
            : `User '${createUserDto.userName}' created successfully.`;
        console.log('Claude agent message:', agentMessage);
        await this.triggerPostAgentCommand(agentMessage);
        return {
            message: agentMessage,
            createdUser,
            roles: roleEntries.map((entry) => entry.role),
            shouldIncludeScan: createUserDto.shouldIncludeScan,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(role_schema_1.Role.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], UsersService);
//# sourceMappingURL=users.service.js.map