import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: '用户邮箱地址' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', description: '用户密码' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(128)
  password!: string;
}
