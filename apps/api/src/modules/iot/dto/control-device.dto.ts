import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { DeviceAction } from '../types/iot.types';

/** 控制设备请求 DTO */
export class ControlDeviceDto {
  @ApiProperty({
    example: 'mihome:123456',
    description: '目标设备 ID（与 IoTDevice.id 对应，格式 `${platform}:${nativeId}`）',
  })
  @IsString()
  deviceId!: string;

  @ApiProperty({
    example: 'turn_on',
    enum: ['turn_on', 'turn_off', 'set_property'],
    description: '控制动作',
  })
  @IsIn(['turn_on', 'turn_off', 'set_property'])
  action!: DeviceAction;

  @ApiPropertyOptional({
    example: 'brightness',
    description: 'set_property 动作时指定的属性名',
  })
  @IsString()
  @IsOptional()
  property?: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'set_property 动作时设定的属性值',
  })
  @IsOptional()
  value?: unknown;
}
