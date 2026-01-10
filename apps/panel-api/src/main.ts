import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {WsAdapter} from "@nestjs/platform-ws"


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  app.enableCors({origin: true, credentials: true});
  await app.listen(process.env.PORT ?? 3000);
  console.log("Panel WS proxy available at ws://localhost:3000/ws/logs?serverId=<id>");
}


bootstrap().catch((err) => {
  console.error('Failed to start the application:', err);
  process.exit(1);
});
