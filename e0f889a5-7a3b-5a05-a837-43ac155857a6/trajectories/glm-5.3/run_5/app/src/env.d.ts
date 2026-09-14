/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    requestId: string;
    customer: { id: number; email: string; name: string } | null;
    cartToken: string;
  }
}
