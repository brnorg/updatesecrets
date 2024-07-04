import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";
import fs from "fs/promises";
import path from "path";

const octokit = new Octokit({
  auth: process.env.TOKEN // Substitua pelo seu token de acesso do GitHub
});

const ownerRepo = process.env.GHREPOSITORY;

async function listEnvironmentsAndDetails() {
  await sodium.ready; // Aguarda o carregamento do sodium

  // Lê o arquivo JSON
  let keysAndValues;
  try {
    const dataPath = path.resolve('configure/data.json');
    const fileContent = await fs.readFile(dataPath, 'utf-8');
    keysAndValues = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Erro ao ler o arquivo JSON: ${error.message}`);
    return;
  }

  try {
    const [owner, repo] = ownerRepo.split('/');
    const environmentsResponse = await octokit.request('GET /repos/{owner}/{repo}/environments', {
      owner: owner,
      repo: repo
    });

    const environments = environmentsResponse.data.environments;

    for (const environment of environments) {
      console.log(`\nEnvironment: ${environment.name}`);

      // Listar variáveis do ambiente atual
      let variables = [];
      try {
        const variablesResponse = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/variables', {
          owner: owner,
          repo: repo,
          environment_name: environment.name
        });
        variables = variablesResponse.data.variables;
      } catch (error) {
        console.error(`Erro ao obter variáveis para o ambiente ${environment.name}: ${error.message}`);
      }

      // Listar segredos do ambiente atual
      let secrets = [];
      try {
        const secretsResponse = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/secrets', {
          owner: owner,
          repo: repo,
          environment_name: environment.name
        });
        secrets = secretsResponse.data.secrets;
      } catch (error) {
        console.error(`Erro ao obter segredos para o ambiente ${environment.name}: ${error.message}`);
      }

      // Obter a chave pública para criptografar segredos
      let publicKey, publicKeyId;
      try {
        const publicKeyResponse = await octokit.request('GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key', {
          owner: owner,
          repo: repo,
          environment_name: environment.name
        });
        publicKey = publicKeyResponse.data.key;
        publicKeyId = publicKeyResponse.data.key_id;
      } catch (error) {
        console.error(`Erro ao obter a chave pública: ${error.message}`);
        continue;
      }

      for (const keyValuePair of keysAndValues) {
        const variable = variables.find(v => v.name === keyValuePair.name);
        const secret = secrets.find(s => s.name === keyValuePair.name);

        if (variable) {
          if (!variable.value) {
            // Atualizar variável se estiver vazia
            try {
              await octokit.request('PATCH /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}', {
                owner: owner,
                repo: repo,
                environment_name: environment.name,
                name: keyValuePair.name,
                value: keyValuePair.value
              });
              console.log(`Updated variable ${keyValuePair.name} in environment ${environment.name}`);
            } catch (error) {
              console.error(`Erro ao atualizar a variável ${keyValuePair.name} no ambiente ${environment.name}: ${error.message}`);
            }
          } else {
            console.log(`Variable ${keyValuePair.name} in environment ${environment.name} is not empty, skipping update`);
          }
        } else if (secret) {
          if (!secret.value) {
            // Criptografar o valor do segredo
            let binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
            let binsec = sodium.from_string(keyValuePair.value);

            // Encrypt the secret using libsodium
            let encBytes = sodium.crypto_box_seal(binsec, binkey);

            // Convert the encrypted Uint8Array to Base64
            let output = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
            let encryptedValue = output;

            // Atualizar segredo se estiver vazio
            try {
              await octokit.request('PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}', {
                owner: owner,
                repo: repo,
                environment_name: environment.name,
                secret_name: keyValuePair.name,
                encrypted_value: encryptedValue,
                key_id: publicKeyId
              });
              console.log(`Updated secret ${keyValuePair.name} in environment ${environment.name}`);
            } catch (error) {
              console.error(`Erro ao atualizar o segredo ${keyValuePair.name} no ambiente ${environment.name}: ${error.message}`);
            }
          } else {
            console.log(`Secret ${keyValuePair.name} in environment ${environment.name} is not empty, skipping update`);
          }
        } else {
          console.log(`No matching variable or secret found for ${keyValuePair.name} in environment ${environment.name}`);
        }
      }
    }
  } catch (error) {
    console.error(`Erro: ${error.message}`);
  }
}

listEnvironmentsAndDetails();
