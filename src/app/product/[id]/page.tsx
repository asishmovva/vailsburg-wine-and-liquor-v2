import ProductClient from "./ProductClient";

export default function ProductPage({ params }: { params: { id: string } }) {
  return <ProductClient id={params.id} />;
}
