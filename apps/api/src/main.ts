import "reflect-metadata";
import { config as loadDotenv } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  loadDotenv({ override: true });

  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error"],
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(`HealTrip API listening on http://localhost:${port}`);
}

bootstrap();
