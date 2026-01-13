import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';

/**
 * Initializes and starts the application using the NestFactory.
 * Configures various app-level settings such as WebSocket adapter,
 * shutdown hooks, and Cross-Origin Resource Sharing (CORS).
 *
 * @return {Promise<void>} A promise that resolves when the application has successfully started.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap().catch((err) => {
  console.error('Failed to start the application:', err);
  process.exit(1);
});
