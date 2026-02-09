import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {WsAdapter} from '@nestjs/platform-ws';

/**
 * Initializes and starts the application using the NestFactory.
 * Configures various app-level settings such as WebSocket adapter,
 * shutdown hooks, Cross-Origin Resource Sharing (CORS), and proxy trust.
 *
 * @return {Promise<void>} A promise that resolves when the application has successfully started.
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    app.useWebSocketAdapter(new WsAdapter(app));
    app.enableShutdownHooks();
    app.enableCors({origin: true, credentials: true});

    // Trust proxy for rate-limiting behind reverse proxy (nginx, etc.)
    // This ensures X-Forwarded-For header is used for IP identification
    app.getHttpServer().set('trust proxy', 1);

    await app.listen(process.env.PORT ?? 3000);
    console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap().catch((err) => {
    console.error('Failed to start the application:', err);
    process.exit(1);
});
