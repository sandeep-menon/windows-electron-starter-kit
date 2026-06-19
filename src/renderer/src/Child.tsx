import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Background } from "./components/Background";
import ThemeToggle from "./components/ThemeToggle";
import { Button } from "./components/ui/button";
import { Loader2Icon } from "lucide-react";

export default function Child() {
    const [firstName, setFirstName] = useState("");
    const [saving, setSaving] = useState(false);

    const trimmed = firstName.trim();
    const canSave = trimmed.length > 0 && !saving;

    useEffect(() => {
        let active = true;
        (async () => {
            const resp = await window.api.invoke("get-first-name");
            if (!active) return;
            if (resp.success) {
                setFirstName(resp.data ?? "");
            } else {
                toast.error(resp.error.message);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const handleSave = async (): Promise<void> => {
        if (!canSave) return;
        setSaving(true);
        try {
            const resp = await window.api.invoke("set-first-name", { firstName: trimmed });
            if (!resp.success) {
                toast.error(resp.error.message);
            } else {
                toast.success(`Saved "${trimmed}"`);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Background />
            <div className="fixed top-4 right-4 z-10">
                <ThemeToggle />
            </div>
            <main className="relative z-1 flex h-screen flex-col items-center justify-center gap-4">
                <h1 className="font-serif text-3xl font-light text-foreground">
                    What's your first name?
                </h1>
                <div className="flex items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="first-name" className="text-xs text-muted-foreground">
                            First name
                        </label>
                        <input
                            type="text"
                            id="first-name"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave();
                            }}
                            disabled={saving}
                            className="w-48 rounded border bg-background px-2 py-1 text-foreground"
                        />
                    </div>
                    <Button onClick={handleSave} disabled={!canSave}>
                        {saving && <Loader2Icon className="size-4 animate-spin" />}
                        Save
                    </Button>
                </div>
            </main>
        </>
    );
}
