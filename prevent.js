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
        console.error(`Erro ao obter a chave pública: ${error.message
