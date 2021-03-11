function OnUpdate(doc,meta) {
    while (true) {
        try {
            if(doc === null){
                return;
            }
            const build_version = doc['build'];
            const [doc_to_insert, doc_to_insert_meta] = get_build_document(build_version);
            const [all_jobs_document, all_jobs_document_meta] = get_all_jobs_document();
            let update_all_jobs_document = false;
            const os = doc['os'];
            const component = doc['component'];
            const name = doc['name'];
            let sub_component;
            if (typeof doc === undefined || doc.hasOwnProperty('subComponent')) {
                sub_component = doc['subComponent'];
            }
            else {
                sub_component = "";
            }
            if (!doc_to_insert.hasOwnProperty('os')) {
                doc_to_insert['os'] = {};
            }
            if (!doc_to_insert['os'].hasOwnProperty(os)) {
                doc_to_insert['os'][os] = {};
            }
            if (!doc_to_insert['os'][os].hasOwnProperty(component)){
                doc_to_insert['os'][os][component] = {}
            }
            if (!doc_to_insert['os'][os][component].hasOwnProperty(name)){
                doc_to_insert['os'][os][component][name] = []
            }
            if (!all_jobs_document.hasOwnProperty('server')) {
                all_jobs_document['server'] = {};
            }
            if (!all_jobs_document['server'].hasOwnProperty(os)) {
                all_jobs_document['server'][os] = {};
            }
            if (!all_jobs_document['server'][os].hasOwnProperty(component)) {
                all_jobs_document['server'][os][component] = {};
            }
            //const implementedIn = get_implemented_in(component, sub_component);
            const version = build_version.split('-')[0];
            if (!(name in all_jobs_document['server'][os][component])) {
                all_jobs_document['server'][os][component][name] = {
                    "totalCount" : doc['totalCount'],
                    "url" : doc['url'],
                    "priority" : doc['priority'],
                    "jobs_in" : [version]
                };
                update_all_jobs_document = true;
            }
            else {
                if (all_jobs_document['server'][os][component][name]['jobs_in'].indexOf(version) == -1){
                    all_jobs_document['server'][os][component][name]['jobs_in'].push(version);
                  
                    all_jobs_document['server'][os][component][name]['jobs_in'] =
                        all_jobs_document['server'][os][component][name]['jobs_in'].sort().filter(function(item, pos, ary){
                        return !pos || item != ary[pos - 1];
                    })
    
                    update_all_jobs_document = true;
                
                }
            }
            var build_to_store = {
                "build_id": doc['build_id'],
                "claim": doc['claim'],
                "totalCount": doc['totalCount'],
                "result": doc['result'],
                "duration": doc['duration'],
                "url": doc['url'],
                "priority": doc['priority'],
                "failCount": doc['failCount'],
                "color": (doc.hasOwnProperty('color'))? doc['color']:'',
                "deleted": false,
                "olderBuild": false,
                "disabled": false
            }
            if (doc.hasOwnProperty("skipCount")) {
                build_to_store["skipCount"] = doc["skipCount"]
            }
            if (doc["bugs"] !== undefined) {
                build_to_store["bugs"] = doc["bugs"]
            }
            if (doc["triage"] !== undefined) {
                build_to_store["triage"] = doc["triage"]
            }
            let store_build = true;
            for (let job of doc_to_insert['os'][os][component][name]) {
                if(job['build_id'] === build_to_store['build_id'] && job['url'] === build_to_store['url'] && job["result"] === build_to_store["result"] && job["duration"] === build_to_store["duration"] && job["totalCount"] === build_to_store["totalCount"] && job["failCount"] === build_to_store["failCount"]) {
                    store_build = false;
                }
            }
            if (!store_build){
                if(!update_all_jobs_document) {
                    return;
                }
            }
            else {
                doc_to_insert['os'][os][component][name].push(build_to_store);
                //Sort all the builds for the job and remove any duplicates from it.
                doc_to_insert['os'][os][component][name] = doc_to_insert['os'][os][component][name].sort(function(a, b){
                    return b['build_id'] - a['build_id'];
                }).filter(function(item, pos, ary){
                    return !pos || item.build_id != ary[pos - 1].build_id;
                });
                doc_to_insert['os'][os][component][name][0]['olderBuild'] = false;
                for(var i = 1; i < doc_to_insert['os'][os][component][name].length; i++ ){
                    doc_to_insert['os'][os][component][name][i]['olderBuild'] = true;
                }
                let counts = get_total_count(doc_to_insert);
                const totalCount = counts['totalCount'];
                const failCount = counts['failCount'];
                log('totalCount', totalCount);
                log('failCount', failCount);
                doc_to_insert['totalCount'] = totalCount;
                doc_to_insert['failCount'] = failCount;
                if (!replaceOrInsert(doc_to_insert_meta, doc_to_insert)) {
                    continue;
                }
                for(let i=0; i < 5; i++){
                    let valid = validateData(doc, build_to_store);
                    if (valid) {
                        break;
                    }
                }
            }
            if (update_all_jobs_document) {
                if (!replaceOrInsert(all_jobs_document_meta, all_jobs_document)) {
                    continue;
                }
                for(let i=0; i < 1; i++){
                    let valid = validateExistingBuilds(doc,all_jobs_document["server"][os][component][name]);
                    if (valid) {
                        break;
                    }
                }
            }
            break;
        } catch (e) {
            log("exception", e);
        }
    }

}
function OnDelete(meta) {
}

function replaceOrInsert(meta, doc) {
    if (meta.cas !== undefined) {
        const res = couchbase.replace(tgt, meta, doc);
        return res.success;
    } else {
        const res = couchbase.insert(tgt, meta, doc);
        return res.success;
    }
}

function get_build_document(build_version) {
    const doc_id = build_version.concat("_server");
    const res = couchbase.get(tgt, { id: doc_id});
    if (res.success) {
        return [res.doc, res.meta];
    } else {
        const new_build_to_store = {
            "build": build_version,
            "totalCount": 0,
            "failCount": 0,
            "type": 'server',
            "os": {}
        };
        return [new_build_to_store, { id: doc_id }];
    }
}

function get_all_jobs_document(){
    const res = couchbase.get(tgt, { id: "existing_builds_server"});
    if (res.success) {
        return [res.doc, res.meta];
    } else {
        return [{}, { id: "existing_builds_server" }];
    }
}



function get_total_count(doc_to_insert){
    let totalCount = 0;
    let failCount = 0;
    log('getting total count');
    try {
        let osKeys = Object.keys(doc_to_insert['os']);
        for (let os of osKeys){
            let componentKeys = Object.keys(doc_to_insert['os'][os]);
            for(let component of componentKeys){
                let jobNameKeys = Object.keys(doc_to_insert['os'][os][component]);
                for(let jobName of jobNameKeys){
                    if (doc_to_insert['os'][os][component][jobName].length > 0){
                        let olderBuild = doc_to_insert['os'][os][component][jobName][0];
                        totalCount += olderBuild['totalCount'];
                        failCount += olderBuild['failCount'];
                    }
                }
            }
        }
    } catch (e) {
        log('Exception in get_total_count', e);
    }
    return {"totalCount": totalCount, "failCount": failCount};
}

function validateExistingBuilds(doc,build_to_store){
    try{
      const build_version = doc["build"]
      const build_id = doc["build_id"]
      const [existing_build_doc, existing_build_doc_meta] = get_all_jobs_document()
      
      const os = doc['os'];
      const component = doc['component'];
      const name = doc['name'];
      const version = doc['build'].split('-')[0]
      var valid_data = false

      const valid_doc = {
        "totalCount" : doc['totalCount'],
        "url" : doc['url'],
        "priority" : doc['priority'],
        "jobs_in" : [version]
      };

      function upsertDoc(doc_to_upsert){
        log("Invalid data found in validateExistingBuilds")
        replaceOrInsert(existing_build_doc_meta, doc_to_upsert)
      }

     
      if(existing_build_doc["server"].hasOwnProperty(os)){
        if(existing_build_doc["server"][os].hasOwnProperty(component)){
          if(existing_build_doc["server"][os][component].hasOwnProperty(name)){
            let existing_job = existing_build_doc["server"][os][component][name]
            if(existing_job["totalCount"] == build_to_store["totalCount"] &&
               existing_job["url"] == build_to_store["url"] &&
               existing_job["priority"] == build_to_store["priority"] && 
               JSON.stringify(existing_job["jobs_in"].sort()) == JSON.stringify(build_to_store["jobs_in"].sort())){
                  valid_data = true
            }
            else{
              valid_data = false
              existing_build_doc["server"][os][component][name] = build_to_store
              upsertDoc(existing_build_doc)
            }
          }
          else{
            existing_build_doc["server"][os][component][name] = build_to_store
            upsertDoc(existing_build_doc)
          }
        }
        else{
          existing_build_doc["server"][os][component] = {}
          existing_build_doc["server"][os][component][name] = build_to_store
          upsertDoc(existing_build_doc)
        }
      }
      else{
        existing_build_doc["server"][os] = {}
        existing_build_doc["server"][os][component] = {}
        existing_build_doc["server"][os][component][name] = build_to_store
        upsertDoc(existing_build_doc)
      }
      return valid_data
    }

    catch(e){
      log("Exception",e)
      return false
    }
}

function validateData(doc, build_to_store) {
    try {
        const build_version = doc['build'];
        const build_id = doc['build_id'];
        const [doc_to_insert, doc_to_insert_meta] = get_build_document(build_version);
        let valid_data = false;
        const os = doc['os'];
        const component = doc['component'];
        const name = doc['name'];
        function upsertDocument(doc_to_upsert) {
            log("Invalid data found in validateData")
            let counts = get_total_count(doc_to_insert);
            const totalCount = counts['totalCount'];
            const failCount = counts['failCount'];
            doc_to_upsert['totalCount'] = totalCount;
            doc_to_upsert['failCount'] = failCount;
            replaceOrInsert(doc_to_insert_meta, doc_to_insert)
        }
        if (doc_to_insert.hasOwnProperty('os')) {
            if (doc_to_insert['os'].hasOwnProperty(os)) {
                if (doc_to_insert['os'][os].hasOwnProperty(component)) {
                    if (doc_to_insert['os'][os][component].hasOwnProperty(name)) {
                        let jobs = doc_to_insert['os'][os][component][name];
                        let job_to_check = jobs.find(function (job) {
                            return job['build_id'] === doc['build_id'];
                        });
                        if (job_to_check !== undefined) {
                            if (job_to_check['totalCount'] === doc['totalCount'] &&
                                job_to_check['result'] === doc['result'] &&
                                job_to_check['duration'] === doc['duration'] &&
                                job_to_check['url'] === doc['url'] &&
                                job_to_check['priority'] === doc['priority'] &&
                                job_to_check['failCount'] == doc['failCount']) {
                                valid_data = true;
                            } else {
                                let index_of_job = jobs.findIndex(function (job) {
                                    return job['build_id'] === doc['build_id'];
                                });
                                let older_build = jobs[index_of_job];
                                let new_build_to_store = build_to_store;
                                new_build_to_store['olderBuild'] = older_build['olderBuild'];
                                new_build_to_store['deleted'] = older_build['deleted'];
                                new_build_to_store['disabled'] = older_build['disabled'];
                                doc_to_insert['os'][os][component][name][index_of_job] = new_build_to_store;
                                upsertDocument(doc_to_insert);
                                valid_data = false;
                            }
                        }
                    }
                    else {
                        doc_to_insert['os'][os][component][name] = [build_to_store];
                        upsertDocument(doc_to_insert);
                    }
                }
                else {
                    doc_to_insert['os'][os][component] = {};
                    doc_to_insert['os'][os][component][name] = [build_to_store];
                    upsertDocument(doc_to_insert);
                }
            }
            else {
                doc_to_insert['os'][os] = {}
                doc_to_insert['os'][os][component] = {};
                doc_to_insert['os'][os][component][name] = [build_to_store];
                upsertDocument(doc_to_insert);
            }
        }
        else {
            doc_to_insert['os'] = {};
            doc_to_insert['os'][os] = {};
            doc_to_insert['os'][os][component] = {};
            doc_to_insert['os'][os][component][name] = [build_to_store];
            upsertDocument(doc_to_insert);
        }
        return valid_data;
    }
    catch (e) {
        log("exception", e);
        return false;
    }
}