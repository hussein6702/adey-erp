export default function PageTitle({ title, description }) {
  return (
    <div className="border-b border-zinc-200 px-8 py-6 dark:border-zinc-800">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      )}
    </div>
  );
}
