import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { Model } from 'mongoose';
import { CreateUserDto } from '../dto/create-user.dto';
import { Role, RoleDocument } from '../schemas/role.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  private async generateClaudeMessage(): Promise<string> {
    const region = process.env.AWS_REGION ?? 'ap-south-1';
    const baseURL =
      process.env.BEDROCK_RUNTIME_BASE_URL ?? `https://bedrock-runtime.${region}.amazonaws.com`;
    const modelId =
      process.env.ANTHROPIC_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'global.anthropic.claude-opus-4-8';
    const apiKey =
      process.env.AWS_BEDROCK_BEARER_TOKEN ?? process.env.ANTHROPIC_API_KEY;

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
            content:
              'Generate one concise human-readable message about a secure role scanning result. It should sound like a real security review update and be one sentence only. Do not include markdown, bullets, or extra formatting.',
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return `Claude agent request failed: ${response.status} ${text}`;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const content = Array.isArray(payload.content) ? payload.content : [];
    const text = content
      .filter((block): block is { type: string; text?: string } => !!block && typeof block === 'object' && 'text' in block)
      .map((block) => block.text)
      .filter((value): value is string => typeof value === 'string')
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

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.userModel.findOne({
      userName: createUserDto.userName,
    });

    if (existingUser) {
      return {
        message: 'user already exists',
      };
    }

    const roleEntries = await Promise.all(
      createUserDto.role.map(async (roleName) => {
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
      }),
    );

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

    return {
      message: agentMessage,
      createdUser,
      roles: roleEntries.map((entry) => entry.role),
      shouldIncludeScan: createUserDto.shouldIncludeScan,
    };
  }
}
