export type CrudRepository<TEntity, TInput = TEntity, TPatch = Partial<TEntity>> = {
  list(): TEntity[];
  findById(id: string): TEntity | undefined;
  getById(id: string): TEntity | undefined;
  create(input: TInput): TEntity;
  update(id: string, patch: TPatch): TEntity | undefined;
  delete(id: string): boolean;
};

export function replaceById<T extends { id: string }>(items: T[], id: string, updater: (item: T) => T) {
  return items.map((item) => (item.id === id ? updater(item) : item));
}

export function removeById<T extends { id: string }>(items: T[], id: string) {
  return items.filter((item) => item.id !== id);
}

