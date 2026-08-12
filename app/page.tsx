import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Image
        src="/images/orange-shield.png"
        alt="Orange shield"
        width={256}
        height={256}
      />
      <p className="text-sm text-gray-500">KMCQ GmbH URL Checkpoint</p>
    </div>
  );
}
