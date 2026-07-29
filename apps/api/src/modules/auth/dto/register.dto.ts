import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: '用户邮箱地址' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', description: '密码（至少8位，包含字母和数字）', minLength: 8 })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少需要8个字符' })
  @MaxLength(128, { message: '密码不能超过128个字符' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
    message: '密码必须包含至少一个字母和一个数字',
  })
  password!: string;

  @ApiProperty({ example: '张三', description: '用户昵称', minLength: 2 })
  @IsString()
  @IsNotEmpty({ message: '昵称不能为空' })
  @MinLength(2, { message: '昵称至少需要2个字符' })
  @MaxLength(100, { message: '昵称不能超过100个字符' })
  nickname!: string;
}
