import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {WhatsappModule} from './whatsup/whatsup.module';
import { MongooseModule } from '@nestjs/mongoose';

 

@Module({
  imports: [
     ConfigModule.forRoot({ isGlobal: true }),
    
     MongooseModule.forRootAsync({
      useFactory: () => {
        const mongoUri = process.env.MONGO_URI;

        if (!mongoUri) {
          console.log('❌ MONGO_URI missing');
          throw new Error('MONGO_URI missing');
        }

        console.log('⏳ Connecting to MongoDB...');

        return {
          uri: mongoUri,

          connectionFactory: (connection) => {
            if (connection.readyState === 1) {
              console.log('✅ MongoDB connected successfully');
            }

             
            connection.on('error', (err) => {
              console.log('❌ MongoDB connection failed');
              console.log(err.message);
            });

            return connection;
          },
        };
      },
    }),

     WhatsappModule,
  ],
   
})


export class AppModule {}
