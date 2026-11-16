import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export async function loader({ request }) {
  return { errors: loginErrorMessage(await login(request)) };
}

export async function action({ request }) {
  return { errors: loginErrorMessage(await login(request)) };
}

export default function Login() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const errors = actionData?.errors || loaderData.errors;

  return (
    <main style={{ maxWidth: 420, margin: "10vh auto", padding: 24 }}>
      <Form method="post">
        <h1>Log in to Alt Text Bulk Filler</h1>
        <label htmlFor="shop">Shop domain</label>
        <input
          id="shop"
          name="shop"
          placeholder="example.myshopify.com"
          value={shop}
          onChange={(event) => setShop(event.currentTarget.value)}
          autoComplete="on"
          required
        />
        {errors?.shop ? <p role="alert">{errors.shop}</p> : null}
        <button type="submit">Continue</button>
      </Form>
    </main>
  );
}
