type Props = { text: string };

export default function HelpTooltip({ text }: Props) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        marginLeft: 4,
        fontSize: 10,
        fontWeight: 600,
        color: "#888",
        background: "#e5e5e5",
        borderRadius: "50%",
        cursor: "help",
      }}
      aria-label={text}
    >
      ?
    </span>
  );
}
