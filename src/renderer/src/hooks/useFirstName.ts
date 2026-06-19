import { useEffect, useState } from "react";

export function useFirstName(): string {
    const [firstName, setFirstName] = useState("");

    useEffect(() => {
        let active = true;
        window.api.invoke("get-first-name").then((resp) => {
            if (!active) return;
            if (resp.success) setFirstName(resp.data);
            else window.api.log.error(`get-first-name failed: ${resp.error.message}`);
        });

        const unsubscribe = window.api.on("first-name-changed", (_event, name) => {
            setFirstName(name);
        });

        return () => {
            active = false;
            unsubscribe();
        }
    },[]);

    return firstName;
}