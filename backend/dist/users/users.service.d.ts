import { Model } from 'mongoose';
import { CreateUserDto } from '../dto/create-user.dto';
import { Role, RoleDocument } from '../schemas/role.schema';
import { User, UserDocument } from '../schemas/user.schema';
export declare class UsersService {
    private readonly userModel;
    private readonly roleModel;
    constructor(userModel: Model<UserDocument>, roleModel: Model<RoleDocument>);
    private generateClaudeMessage;
    private triggerPostAgentCommand;
    create(createUserDto: CreateUserDto): Promise<{
        message: string;
        createdUser?: undefined;
        roles?: undefined;
        shouldIncludeScan?: undefined;
    } | {
        message: string;
        createdUser: import("mongoose").Document<unknown, {}, import("mongoose").Document<unknown, {}, User, {}, import("mongoose").DefaultSchemaOptions> & User & {
            _id: import("mongoose").Types.ObjectId;
        } & {
            __v: number;
        } & {
            id: string;
        }, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Document<unknown, {}, User, {}, import("mongoose").DefaultSchemaOptions> & User & {
            _id: import("mongoose").Types.ObjectId;
        } & {
            __v: number;
        } & {
            id: string;
        } & Required<{
            _id: import("mongoose").Types.ObjectId;
        }>;
        roles: (import("mongoose").Document<unknown, {}, Role, {}, import("mongoose").DefaultSchemaOptions> & Role & {
            _id: import("mongoose").Types.ObjectId;
        } & {
            __v: number;
        } & {
            id: string;
        } & Required<{
            _id: import("mongoose").Types.ObjectId;
        }>)[];
        shouldIncludeScan: boolean;
    }>;
}
