#!/usr/bin/env node
import { getDesktopSidecar } from "./src/sidecar.mjs";

async function probeGraphql() {
  try {
    const sidecar = await getDesktopSidecar(5000);
    const res = await fetch(`${sidecar.baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sidecar.auth
      },
      body: JSON.stringify({query: '{ __schema { types { name } } }'})
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e.message);
  }
}

probeGraphql();
