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
      <p className="text-sm text-gray-500"><b>KMCQ GmbH</b> URL Checkpoint</p>
      <p className="text-sm text-gray-500 -mt-[18px]">A URL Link Security Features.</p>
    </div>
  );
}
