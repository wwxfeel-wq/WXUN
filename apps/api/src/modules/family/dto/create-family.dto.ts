import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFamilyDto {
  @ApiProperty({ example: '张氏家族', description: '家庭名称' })
  @IsString()
  @IsNotEmpty({ message: '家庭名称不能为空' })
  @MinLength(1, { message: '家庭名称不能为空' })
  @MaxLength(100, { message: '家庭名称不能超过100个字符' })
  name!: string;

  @ApiPropertyOptional({ example: '记录我们一家人的美好回忆', description: '家庭描述' })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: '家庭描述不能超过500个字符' })
  description?: string;
}
