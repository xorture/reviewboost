import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { TwilioProvider } from './providers/twilio.provider';
import { MetaProvider } from './providers/meta.provider';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  providers: [WhatsAppService, TwilioProvider, MetaProvider],
  controllers: [WhatsAppController],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
