import { Background } from "./components/Background";
import ThemeToggle from "./components/ThemeToggle";

export default function Child() {
    return (
        <>
            <Background />
            <div className="fixed top-4 right-4 z-10">
                <ThemeToggle />
            </div>
            <main className="relative z-1 flex h-screen flex-col items-center justify-center gap-4">
                <h1 className="font-serif text-3xl font-light text-foreground">I'm the child window</h1>
                <p className="text-sm text-muted-foreground">
                    Loaded straight from the <code>#child</code> entry - no router involved.
                </p>
            </main>
        </>
    )
}