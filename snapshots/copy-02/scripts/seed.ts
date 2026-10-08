import path from "node:path";
import { ProfileRepository } from "../lib/db/repository";

const repository = new ProfileRepository(path.resolve(process.cwd(), process.env.GENESIS_DB_PATH || "./data/genesis.db"));
console.log(`Seed ready. Current records: ${repository.snapshot().entries.length}. No fabricated history was inserted.`);
repository.close();
