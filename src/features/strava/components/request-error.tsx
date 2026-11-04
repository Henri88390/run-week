"use client";

import { useEffect, useState } from "react";

export function RequestError({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <p role="alert" className="text-sm font-medium text-red-700">{message}</p> : null;
}
