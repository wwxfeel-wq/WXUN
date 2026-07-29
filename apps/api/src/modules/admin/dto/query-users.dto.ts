import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { UserStatus } from '@echolife/shared';

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserStatus, description: '用户状态筛选' })
  @IsIn(Object.values(UserStatus))
  @IsOptional()
  @IsString()
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'user@example.com', description: '搜索关键词（邮箱）' })
  @IsString()
  @IsOptional()
  search?: string;
}
