import { toast } from "sonner";
import { Button } from "./components/ui/button";

export default function App() {
  const handleClickMe = () => {
    toast.success("You clicked me!");
  }
  return (
    <div className="h-screen flex flex-col gap-2 justify-center items-center">
      <div>Hello, world!</div>
      <Button variant={"outline"} onClick={handleClickMe}>Click me!</Button>
    </div>
  )
}