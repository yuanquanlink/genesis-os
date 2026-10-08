import { GenesisApp } from "@/components/genesis-app";
import { getRepository } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default function Page() {
  return <GenesisApp section="today" initialSnapshot={getRepository().snapshot()} />;
}
