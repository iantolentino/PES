export default function Page({ title }: { title: string }) {
  return (
    <main className="container mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-muted-foreground">Performance Evaluation System demo screen.</p>
    </main>
  );
}
