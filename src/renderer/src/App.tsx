import { useState } from "react";
import { toast } from "sonner";
import { Background } from "./components/Background";
import ThemeToggle from "./components/ThemeToggle";
import { Button } from "./components/ui/button";
import { Loader2Icon } from "lucide-react";
import { useFirstName } from "./hooks/useFirstName";

export default function App() {
    const [todoId, setTodoId] = useState("1");
    const [loading, setLoading] = useState<null | "random" | "byId">(null);
    const [boom, setBoom] = useState(false);

    if (boom) throw new Error("Testing the error boundary");
    const busy = loading !== null;

    const parsedId = Number(todoId);
    const idValid = todoId.trim() !== "" && Number.isInteger(parsedId) && parsedId > 0;

    const firstName = useFirstName();

    const handleClickMe = (): void => {
        toast.success("You clicked me!");
    };

    const handleLoadRandom = async (): Promise<void> => {
        setLoading("random");
        try {
            const resp = await window.api.invoke("get-random-todo");
            if (!resp.success) {
                toast.error(resp.error.message);
            } else {
                toast.info(resp.data.todo);
            }
        } finally {
            setLoading(null);
        }
    };

    const handleLoadById = async (): Promise<void> => {
        if (!idValid) {
            toast.warning("Enter a whole number greater than 0.");
            return;
        }
        setLoading("byId");
        try {
            const resp = await window.api.invoke("get-todo-by-id", { id: parsedId });
            if (!resp.success) {
                toast.error(resp.error.message);
            } else {
                toast.info(resp.data.todo);
            }
        } finally {
            setLoading(null);
        }
    };

    const handleOpenChildWindow = async (): Promise<void> => {
        const resp = await window.api.invoke("open-child-window");
        if (!resp.success) {
            toast.error(resp.error.message);
        }
    };

    return (
        <>
            <Background />

            <div className="fixed top-4 right-4 z-10">
                <ThemeToggle />
            </div>

            <main className="relative z-0 flex h-screen flex-col items-center justify-center gap-4">
                <h1 className="font-serif text-3xl font-light text-foreground">
                    Hello, {firstName || "stranger"}
                </h1>

                <div className="flex gap-2">
                    <Button onClick={handleLoadRandom} disabled={busy}>
                        {loading === "random" && <Loader2Icon className="size-4 animate-spin" />}
                        Load a random todo
                    </Button>
                    <Button variant="outline" onClick={handleClickMe} disabled={busy}>
                        Click me!
                    </Button>
                </div>

                <div className="flex items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="todo-id" className="text-xs text-muted-foreground">
                            Todo ID
                        </label>
                        <input
                            id="todo-id"
                            type="number"
                            min={1}
                            step={1}
                            value={todoId}
                            onChange={(e) => setTodoId(e.target.value)}
                            aria-invalid={!idValid}
                            disabled={busy}
                            className="w-24 rounded border bg-background px-2 py-1 text-foreground"
                        />
                    </div>
                    <Button onClick={handleLoadById} disabled={busy || !idValid}>
                        {loading === "byId" && <Loader2Icon className="size-4 animate-spin" />}
                        Load todo by ID
                    </Button>
                </div>
                <Button variant="secondary" onClick={handleOpenChildWindow}>
                    Open child window
                </Button>
                <Button variant="destructive" onClick={() => setBoom(true)}>
                    Throw an error
                </Button>
            </main>
        </>
    );
}
