import { MongoClient } from "mongodb";

const globalMongo = globalThis as typeof globalThis & { mongoConnection?: Promise<MongoClient> };

export async function getMongo() {
  if (!process.env.MONGODB_URL) throw new Error("未配置数据库连接");
  if (!globalMongo.mongoConnection) {
    const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 });
    globalMongo.mongoConnection = client.connect().catch((error) => {
      globalMongo.mongoConnection = undefined;
      throw error;
    });
  }
  return globalMongo.mongoConnection;
}
