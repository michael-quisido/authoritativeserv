import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Image
        src="/images/orange-shield.png"
        alt="Orange shield"
        width={256}
        height={256}
      />
    </div>
  );
}
