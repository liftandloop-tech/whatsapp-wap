import { Type } from 'class-transformer';
import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';



export class MessageText {
  @IsString()
  body: string;
}


export class Message {
  @IsString()
  from: string;

  @IsString()
  id: string;

  @IsString()
  timestamp: string;

  @IsString()
  type: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MessageText)
  text?: MessageText;
}


export class ContactProfile {
  @IsString()
  name: string;
}


export class Contact {
  @ValidateNested()
  @Type(() => ContactProfile)
  profile: ContactProfile;

  @IsString()
  wa_id: string;
}


export class Metadata {
  @IsString()
  display_phone_number: string;

  @IsString()
  phone_number_id: string;
}


export class Value {
  @IsString()
  messaging_product: string;

  @ValidateNested()
  @Type(() => Metadata)
  metadata: Metadata;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Contact)
  contacts?: Contact[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Message)
  messages?: Message[];
}


export class Change {
  @ValidateNested()
  @Type(() => Value)
  value: Value;

  @IsString()
  field: string;
}


export class Entry {
  @IsString()
  id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Change)
  changes: Change[];
}


// Whatsapp-Webhook-dto
export class WhatsappWebhookDto {
  @IsString()
  object: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Entry)
  entry: Entry[];
}
