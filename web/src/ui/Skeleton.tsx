// Skeleton tiles for a list that is loading (strict review 11.10, feed-loading.svg): two rows of the
// list's own columns, CSS only. Eight tiles are rendered — two rows of the widest case — and the grid
// shows two rows of however many columns --cols says (styles.css .skeleton-grid). Not for a screen
// reader: the list says nothing until it has something to say.
export function SkeletonTiles(props: { [data: `data-${string}`]: string | undefined }) {
  return (
    <ul {...props} className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => <li key={i} className="skeleton" />)}
    </ul>
  );
}
