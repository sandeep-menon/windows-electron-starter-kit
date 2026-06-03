import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./components/ui/button";

export default function App() {
  const [todoId, setTodoId] = useState("1");

  const handleClickMe = () => {
    toast.success("You clicked me!");
  }

  const handleLoadRandom = async () => {
    const resp = await window.api.invoke("get-random-todo");
    if (!resp.success) {
      toast.error(resp.error)
    } else {
      toast.info(resp.data.todo);
    }
  }

  const handleLoadById = async () => {
    const resp = await window.api.invoke("get-todo-by-id", { id: Number(todoId) });
    if (!resp.success) {
      toast.error(resp.error)
    } else {
      toast.info(resp.data.todo);
    }
  }

  return (
    <div className="h-screen flex flex-col gap-2 justify-center items-center">
      <div className="text-gray-700 font-light font-serif text-3xl">Hello, stranger!</div>
      <div className="flex gap-2">
        <Button onClick={handleLoadRandom}>Load a random todo</Button>
        <Button variant={"outline"} onClick={handleClickMe}>Click me!</Button>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={todoId}
          onChange={(e) => setTodoId(e.target.value)}
          className="border rounded px-2 py-1 w-24"
        />
        <Button onClick={handleLoadById}>Load todo by ID</Button>
      </div>
    </div>
  )
}