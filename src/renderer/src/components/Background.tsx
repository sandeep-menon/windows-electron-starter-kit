const BANDS = [
    "bg-blue-200 dark:bg-blue-600",
    "bg-blue-100 dark:bg-blue-700",
    "bg-blue-50 dark:bg-blue-800",
    "bg-white dark:bg-black",
    "bg-green-50 dark:bg-green-800",
    "bg-green-100 dark:bg-green-700",
    "bg-green-200 dark:bg-green-600",
] as const;

export function Background(): React.ReactNode {
    return (
        <div aria-hidden="true" className="fixed inset-0 -z-10 flex">
            {BANDS.map((color, i) => (
                <div key={i} className={`h-full ${i === 3 ? "flex-[4]" : "flex-1"} ${color}`} />
            ))}
        </div>
    )
}