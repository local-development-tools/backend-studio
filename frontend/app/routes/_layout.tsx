import {Outlet} from "react-router";
import {useEffect, useState} from "react";
import {ContainersBar, type ContainerStacks} from "~/components/ContainersBar";
import {Sidebar} from "~/components/Sidebar";
import {
  getStackNames,
  type ContainerDto,
  type StackNameDto,
} from "~/lib/api/containers";
import { parseSSELog } from "~/lib/api/logs";
import { TooltipProvider } from "~/components/ui/tooltip";

export default function Layout() {
  const [stacks, setStacks] = useState<StackNameDto[]>([]);
  const [selectedStack, setSelectedStack] = useState<StackNameDto>("");

  useEffect(() => {
    getStackNames().then((names) => setStacks(names));
  }, []);

  

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-svh overflow-hidden bg-background">
        <Sidebar />
        <div className="flex min-h-0 w-full flex-col overflow-hidden">
          <ContainersBar
            stacks={stacks}
            selectedStack={selectedStack}
            setSelectedStack={setSelectedStack}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet context={{selectedStack}} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
