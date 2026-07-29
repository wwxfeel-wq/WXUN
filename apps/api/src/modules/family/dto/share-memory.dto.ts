import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ShareMemoryDto {
  @ApiProperty({ description: '要分享的记忆ID' })
  @IsUUID('4', { message: '记忆ID格式不正确' })
  @IsNotEmpty({ message: '记忆ID不能为空' })
  memoryId!: string;

  @ApiPropertyOptional({ description: '附言（可选）' })
  @IsString()
  @IsOptional()
  comment?: string;
}
