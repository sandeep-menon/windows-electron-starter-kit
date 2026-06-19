import Store from "electron-store";
import { StoreSchema } from "../../shared/types";

let store: Store<StoreSchema> | null = null;

export function getStore(): Store<StoreSchema> {
    if (!store) {
        store = new Store<StoreSchema>({
            defaults: { firstName: "" },
            clearInvalidConfig: true
        });
    }
    return store;
}