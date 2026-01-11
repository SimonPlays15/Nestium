import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {WsAdapter} from "@nestjs/platform-ws"


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  app.enableCors({origin: true, credentials: true});
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);

}
bootstrap().catch((err) => {
  console.error('Failed to start the application:', err);
  process.exit(1);
});
