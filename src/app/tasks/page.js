import { requirePageSession } from "@/lib/auth";
import TasksPage from "@/components/TasksPage";

export default async function Page({ searchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  await requirePageSession("/tasks" + (params.size ? `?${params}` : ""));
  return <TasksPage />;
}
