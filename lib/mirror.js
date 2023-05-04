const { request } = require("graphql-request");
const Arweave = require("arweave");

const arweave = Arweave.init({ host: "arweave.net", protocol: "https" });
const endpoint = "https://arweave.net/graphql";

// Rabbithole Mirror Address
const address = "0xF719d5d368dA5c7006bFBb7e0A4873b5115Aa11f"

async function subscribeMirrorPosts(notifyMirrorPost) {
   try {
      let { height: lastBlock } = await arweave.blocks.getCurrent();

      setInterval(async () => {
         const min = lastBlock;
         try {
            const { height: max } = await arweave.blocks.getCurrent();
            if (min < max) {
               const query = getQuery(address, min, max);
               const data = await fetchMirrorData(query);
               if (data.length > 0) {
                  for (const post of data) {
                     await notifyMirrorPost({ digest: post.digest, title: post.title });
                  }
               }
               lastBlock = max + 1;
            }
         } catch (error) {
            console.log("There was an error fetching mirror data", error);
         }
      }, 600_000);
   } catch (error) {
      console.log(error);
   }
}

function getQuery(address, min, max) {
   const query = `
   query {
      transactions(
         tags: [
            { name: "App-Name", values: "MirrorXYZ" }
            { name: "Contributor", values: "${address}" }
         ]
         sort: HEIGHT_DESC
         block: { min: ${min} max: ${max} }
      ) {
         edges {
            node {
               id
            }
         }
      }
   }
`;
   return query;
}

async function fetchMirrorData(query) {
   try {
      const data = await request(endpoint, query);
      const posts = data.transactions.edges;
      const postData = [];

      for (const { node: post } of posts) {
         const transaction = await arweave.transactions.get(post.id);

         // get content digest to create link to post
         const tag = transaction.tags.find((tag) => {
            const tagname = tag.get("name", { decode: true, string: true });
            if (tagname === "Original-Content-Digest") {
               return true;
            }
            return false;
         });
         const digest = tag ? tag.get("value", { decode: true, string: true }) : null;
         const data = await arweave.transactions.getData(post.id, {
            decode: true,
            string: true
         });

         const dataObj = JSON.parse(data);

         if (digest && !postData.some((data) => data.digest === digest)) {
            postData.push({ digest, title: dataObj.content.title })
         }
      }
      return postData;
   } catch (error) {
      console.error("Error fetching mirror data:", error);
   }
}

module.exports = subscribeMirrorPosts;