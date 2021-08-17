require('dotenv').config();
const fs = require('fs');

const Discord = require('discord.js');
const request = require('request');
const { debug } = require('console');

const client = new Discord.Client({ intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES] });

const interaction = '!quake';
var timer = undefined; //minutes
var interval = undefined;


client.on("ready", () => {
  console.log('Successfully connected !')
})


client.on('messageCreate', async msg =>{
  if(msg.content.startsWith(interaction)){

    if(msg.content === `${interaction} config`){ //Les commandes de configuration
      msg.channel.send(`Définir la zone dans laquelle le bot cherchera les nouveaux événnements :\n\`${interaction} config area [latitude max] [longitude min] [longitude max] [latitude min]\`\nModifier la temps entre chaque requête : \n\`${interaction} config time [temps en minutes]\`\nAffichier les configuration courante :\n\`${interaction} config show\``);
    }else if(msg.content.startsWith(`${interaction} config area`)){ //Changer les coordonnées de la zone d'alert
      await configArea(msg);
    }else if (msg.content.startsWith(`${interaction} config time`)){ //Changer le temps entre chaque requête et verification
      await configTimer(msg);
    }else if (msg.content ===`${interaction} start`){ //Lancer les alertes 
      if(interval){
        await msg.channel.send(`Commande déjà en cours d'exécution`);
      }else{
        await msg.channel.send(`Affichage des événnements lancé`);
        start(msg);
      }
    }else if(msg.content === `${interaction} stop`){ //Stopper les alertes
      if(interval){
        clearInterval(interval);
        await msg.channel.send('Affichage des événnements stoppé.')
        interval = undefined;
      }else{
        await msg.channel.send('Affichage déjà stoppé.')
      }
    }else if(msg.content === `${interaction} config show`){ //Affiche la configuration
      showConfig(msg);
    }else if(msg.content === `${interaction} help`){
      await help(msg);
    }else{
      await help(msg);
    }

  }
});

/**
 * Lanceur de la boucle de vérification et d'affichage des événnements.
 * @param {*} msg 
 */
async function start(msg){
  var cconfig = await new Promise((resolve, reject)=>{
    fs.readFile('./config.json', 'utf-8',(err, data)=>{
      if(err){
        reject(err);
      }else{
        resolve(data)
      }
    });
  });

  cconfig = JSON.parse(cconfig);
  timer = cconfig['timer'];

  interval = setInterval(()=>{
    sismicEvents(msg);
  }, timer*60000);
}




/**
 * Configuration de la zone où chercher les nouveaux événements sismiques.
 * @param {*} msg 
 * @returns 
 */
const configArea = (msg)=>{
  var split = msg.content.split(" ");
  if(split.length != 7){
    return msg.channel.send('Il manque des infos');
  }

  var coords = [Number.parseFloat(split[3]), Number.parseFloat(split[4]), Number.parseFloat(split[5]), Number.parseFloat(split[6])];

  coords.every(coord =>{
    if(isNaN(coord)){
      return msg.channel.send('Les coordonnées ne doivent être que des nombres.');
    }
    coord.toFixed(2);
  });

  coords = coords.map(coord => coord.toFixed(2));

  fs.readFile('./config.json', 'utf-8',(err, data)=>{
    if(err){
      console.log(`Error reading file from disk: ${err}`);
    }else{
      var cconfig = JSON.parse(data);
      cconfig['area']['maximal_latitude'] = coords[0];
      cconfig['area']['minimal_longitude'] = coords[1];
      cconfig['area']['maximal_longitude'] = coords[2];
      cconfig['area']['minimal_latitude'] = coords[3];

      console.log(cconfig);

      data = JSON.stringify(cconfig);

      fs.writeFile('./config.json', data, 'utf-8', (err)=>{
        if(err){
          console.log(`Error writing file: ${err}`);
          msg.channel.send(`Une erreur s'est produite, les modifications n'ont pas pu être enregistrées.`);
        }else{
          msg.channel.send(`Les nouvelles coordonnées ont bien été prises en compte ☑:\n➡latitude max :\`${coords[0]}\`\n➡longitude min :\`${coords[1]}\`\n➡longitude max :\`${coords[2]}\`\n➡latitude min :\`${coords[3]}\``)
        }
      });

    }
  });
}

/**
 * Configuration du temps entre chaque requête et verification des nouveaux événements.
 * @param {*} msg 
 * @returns 
 */
const configTimer = (msg)=>{
  var split = msg.content.split(" ");
  if(split.length != 4){
    return msg.channel.send('Il manque des infos');
  }

  var newTime = Number.parseInt(split[3]);
  if(isNaN(newTime) || newTime <5){
    return msg.channel.send('La valeur doit être un nombre entier et supérieur ou égale à 5 minutes');
  }

  fs.readFile('./config.json', 'utf-8',(err, data)=>{
    if(err){
      console.log(`Error reading file from disk: ${err}`);
    }else{
      var cconfig = JSON.parse(data);
      cconfig['timer']=newTime;
      data = JSON.stringify(cconfig);
      timer = newTime;
      fs.writeFile('./config.json', data, 'utf-8', (err)=>{
        if(err){
          console.log(`Error writing file: ${err}`);
          msg.channel.send(`Une erreur s'est produite, les modifications n'ont pas pu être enregistrées.`);
        }else{
          clearInterval(interval);
          msg.channel.send(`Le timer a bien été modifié : ${newTime} ⏳\nLa commande \`!quake start\` est requise pour relancer l'affichage des évennements.`);
          interval = undefined;
        }
      })
    }
  });
}

/**
 * Requête et récupère la liste actualisée des événements de la journée courante
 * @returns
 */
const getEvents =async() => {
  var cconfig = await new Promise((resolve, reject)=>{
    fs.readFile('./config.json', 'utf-8',(err, data)=>{
      if(err){
        reject(err);
      }else{
        resolve(data)
      }
    });
  });
  cconfig = JSON.parse(cconfig);
  var date = new Date().toISOString().split('T')[0];
  const URL = `https://api.franceseisme.fr/fdsnws/event/1/query?endtime=${date}T23:59:59.999999Z&format=json&maxlatitude=${cconfig['area']['maximal_latitude']}&maxlongitude=${cconfig['area']['maximal_longitude']}&minlatitude=${cconfig['area']['minimal_latitude']}&minlongitude=${cconfig['area']['minimal_longitude']}&orderby=time&starttime=${date}T00:00:00Z`;
  return new Promise((resolve, reject) =>{
    request.get(URL, {}, (error, res, body)=>{
        if (error) {
            reject(error);
        }else{
            resolve(body);
        }
    });
  });
}

/**
 * Affiche tous les nouveaux évennements ne se trouvant pas dans ./data/data.json 
 * ainsi que ceux qui n'étaient pas validés lors de la vérification précédente.
 * Ecrase les anciennes données avec les nouvelles.
 */
async function sismicEvents(msg){
  var oldData = await new Promise((resolve, reject)=>{
    fs.readFile('./data/data.json', 'utf-8',(err, data)=>{
      if(err){
        reject(err);
      }else{
        resolve(data)
      }
    });
  })
  newData = await getEvents();
  newData = JSON.parse(newData);
  oldData = JSON.parse(oldData);  


  for await(var nd of newData['features']){
    var isIn = false;
    var date = new Date(`${nd['properties']['time']}`);
    for(var od of oldData['features']){
        if(nd['id'] === od['id'] && nd['properties']['automatic'] != od['properties']['automatic']){
          //Evennement validé
          isIn = true;
          await msg.channel.send(`:boom: ${nd['properties']['description']['fr']}\n:alarm_clock: ${date.getDate()}-${date.getMonth()}-${date.getFullYear()} à ${date.getHours()}:${date.getMinutes()}\n:compass: Latitude ${nd['geometry']['coordinates'][1]} Longitude ${nd['geometry']['coordinates'][0]}\nVérifié: :white_check_mark:\n:computer: ${nd['properties']['url']['fr']}\n_______`);
          break;  
        }else if(nd['id'] === od['id'] && nd['properties']['automatic'] == od['properties']['automatic']){
          //Evennement déjà affiché
          isIn = true;
          break;
        }
    }
    if(!isIn){
      if(nd['properties']['automatic']){
        await msg.channel.send(`:boom: ${nd['properties']['description']['fr']}\n:alarm_clock: ${date.getDate()}-${date.getMonth()}-${date.getFullYear()} à ${date.getHours()}:${date.getMinutes()}\n:compass: Latitude ${nd['geometry']['coordinates'][1]} Longitude ${nd['geometry']['coordinates'][0]}\nVérifié: ⌛ (en attente de validation) \n:computer: ${nd['properties']['url']['fr']}\n_______`);
      }else{
        await msg.channel.send(`:boom: ${nd['properties']['description']['fr']}\n:alarm_clock: ${date.getDate()}-${date.getMonth()}-${date.getFullYear()} à ${date.getHours()}:${date.getMinutes()}\n:compass: Latitude ${nd['geometry']['coordinates'][1]} Longitude ${nd['geometry']['coordinates'][0]}\nVérifié: :white_check_mark:\n:computer: ${nd['properties']['url']['fr']}\n_______`);
      }
    }
  }
  var updateFile = JSON.stringify(newData);
  await fs.writeFile('./data/data.json', updateFile, 'utf8', (err)=>{
    if(err){
      console.log(`Error writing file: ${err}`);
    }
  });
}

/**
 * Affiche toute la configuration ./config.json
 * @param {*} msg 
 */
const showConfig = async (msg)=>{
  var promise =  await new Promise((resolve, reject)=>{
    fs.readFile('./config.json', 'utf8', (err, data)=>{
      if(err){
        reject(err);
      }else{
        resolve(data);
      }
    })
  });
  var cconfig = JSON.parse(promise);
  msg.channel.send(`⬆Latitude max: \`${cconfig['area']['maximal_latitude']}\`\n⬅Longitude min: \`${cconfig['area']['minimal_longitude']}\`\n➡Longitude max: \`${cconfig['area']['maximal_longitude']}\`\n⬇Latitude min: \`${cconfig['area']['minimal_latitude']}\`\n⌛Timer: \`${cconfig['timer']}\` minutes`);
}


const help = msg =>{
  msg.channel.send(`Commandes :\n \`${interaction} help\`: liste des commandes,\n \`${interaction} config\`: liste des commandes de configuration,\n \`${interaction} config show\`: affiche la configuration courante,\n \`${interaction} start\`: lancer la boucle des événnements,\n \`${interaction} stop\`: arrêter la boucle des événnements`);
}


client.login(process.env.TOKEN);