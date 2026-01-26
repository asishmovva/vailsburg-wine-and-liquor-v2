import { RequireAuth } from "@/components/auth/RequireAuth";
import FavoritesClient from "./FavoritesClient";

export default function FavoritesPage() {
  return (
    <RequireAuth redirectTo="/favorites">
      <FavoritesClient />
    </RequireAuth>
  );
}
