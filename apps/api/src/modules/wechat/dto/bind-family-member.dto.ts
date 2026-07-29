import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, MinLength } from 'class-validator';

export class BindFamilyMemberDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: '家庭成员 ID' })
  @IsUUID('4', { message: '家庭成员 ID 格式不正确' })
  familyMemberId!: string;

  @ApiPropertyOptional({ example: 'wxid_xxx', description: '微信 ID（wxid / 原始 UserName）' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  wechatId?: string;

  @ApiPropertyOptional({ example: '妈妈', description: '微信昵称' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  wechatNickname?: string;

  @ApiPropertyOptional({ example: 'mum2024', description: '微信 Alias（微信号）' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  wechatAlias?: string;
}
