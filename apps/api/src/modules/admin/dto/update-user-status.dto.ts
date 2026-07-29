import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';
import { UserStatus } from '@echolife/shared';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.INACTIVE],
    example: 'suspended',
    description: '用户状态',
  })
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.INACTIVE], {
    message: '用户状态不正确，可选值: active, suspended, inactive',
  })
  @IsNotEmpty({ message: '状态不能为空' })
  status!: string;
}
