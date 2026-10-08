export const UserBubble = ({ text, images = [] }: { text: string; images?: string[] }) => (
  <div className="flex animate-fade-up flex-col items-end gap-1.5 pl-14">
    {images.length > 0 && (
      <div className="flex flex-wrap justify-end gap-1">
        {images.map((u, i) => <img key={i} src={u} alt={`Attachment ${i + 1}`} className="h-14 w-auto rounded-chip shadow-hairline" />)}
      </div>
    )}
    <div className="rounded-xl bg-field px-3 py-1.5 text-[13.5px] leading-[1.45] whitespace-pre-wrap text-ink">{text}</div>
  </div>
);
