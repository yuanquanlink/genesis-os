import path from "node:path";
import { ProfileRepository } from "../lib/db/repository";

const dbPath = path.resolve(process.cwd(), process.env.GENESIS_DB_PATH || "./data/genesis.db");
const repository = new ProfileRepository(dbPath);
repository.close();
console.log(`Genesis database migrated: ${dbPath}`);
