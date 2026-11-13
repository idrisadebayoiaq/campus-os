import fs from "node:fs";

/** @type {[string, string, string, string, string, string][]} */
const rows = [
  // FEDERAL UNIVERSITIES
  ["University of Ibadan", "UI", "university", "Main Campus", "Ibadan", "Oyo"],
  ["University of Lagos", "UNILAG", "university", "Main Campus", "Akoka", "Lagos"],
  ["University of Nigeria, Nsukka", "UNN", "university", "Nsukka Campus", "Nsukka", "Enugu"],
  ["University of Nigeria, Nsukka", "UNN", "university", "Enugu Campus", "Enugu", "Enugu"],
  ["Ahmadu Bello University", "ABU", "university", "Main Campus", "Zaria", "Kaduna"],
  ["Obafemi Awolowo University", "OAU", "university", "Main Campus", "Ile-Ife", "Osun"],
  ["University of Benin", "UNIBEN", "university", "Ugbowo Campus", "Benin City", "Edo"],
  ["University of Ilorin", "UNILORIN", "university", "Main Campus", "Ilorin", "Kwara"],
  ["University of Jos", "UNIJOS", "university", "Main Campus", "Jos", "Plateau"],
  ["University of Calabar", "UNICAL", "university", "Main Campus", "Calabar", "Cross River"],
  ["University of Port Harcourt", "UNIPORT", "university", "Choba Campus", "Port Harcourt", "Rivers"],
  ["Bayero University, Kano", "BUK", "university", "Main Campus", "Kano", "Kano"],
  ["University of Maiduguri", "UNIMAID", "university", "Main Campus", "Maiduguri", "Borno"],
  ["Usmanu Danfodiyo University", "UDUS", "university", "Main Campus", "Sokoto", "Sokoto"],
  ["University of Abuja", "UNIABUJA", "university", "Main Campus", "Gwagwalada", "FCT"],
  ["Nnamdi Azikiwe University", "UNIZIK", "university", "Awka Campus", "Awka", "Anambra"],
  ["Federal University of Technology, Akure", "FUTA", "university", "Main Campus", "Akure", "Ondo"],
  ["Federal University of Technology, Minna", "FUTMINNA", "university", "Main Campus", "Minna", "Niger"],
  ["Federal University of Technology, Owerri", "FUTO", "university", "Main Campus", "Owerri", "Imo"],
  ["Modibbo Adama University", "MAUTECH", "university", "Main Campus", "Yola", "Adamawa"],
  ["Federal University of Agriculture, Abeokuta", "FUNAAB", "university", "Main Campus", "Abeokuta", "Ogun"],
  ["Michael Okpara University of Agriculture, Umudike", "MOUAU", "university", "Main Campus", "Umudike", "Abia"],
  ["University of Uyo", "UNIUYO", "university", "Main Campus", "Uyo", "Akwa Ibom"],
  ["Federal University, Oye-Ekiti", "FUOYE", "university", "Main Campus", "Oye-Ekiti", "Ekiti"],
  ["Federal University, Lokoja", "FULOKOJA", "university", "Main Campus", "Lokoja", "Kogi"],
  ["Federal University, Dutse", "FUD", "university", "Main Campus", "Dutse", "Jigawa"],
  ["Federal University, Lafia", "FULAFIA", "university", "Main Campus", "Lafia", "Nasarawa"],
  ["Federal University, Kashere", "FUKASHERE", "university", "Main Campus", "Kashere", "Gombe"],
  ["Federal University, Wukari", "FUWUKARI", "university", "Main Campus", "Wukari", "Taraba"],
  ["Federal University, Birnin Kebbi", "FUBK", "university", "Main Campus", "Birnin Kebbi", "Kebbi"],
  ["Federal University, Gusau", "FUGUS", "university", "Main Campus", "Gusau", "Zamfara"],
  ["Federal University, Gashua", "FUGASHUA", "university", "Main Campus", "Gashua", "Yobe"],
  ["Federal University, Dutsin-Ma", "FUDMA", "university", "Main Campus", "Dutsin-Ma", "Katsina"],
  ["Alex Ekwueme Federal University, Ndufu-Alike", "AE-FUNAI", "university", "Main Campus", "Ndufu-Alike", "Ebonyi"],
  ["Federal University of Petroleum Resources, Effurun", "FUPRE", "university", "Main Campus", "Effurun", "Delta"],
  ["Nigerian Defence Academy", "NDA", "university", "Main Campus", "Kaduna", "Kaduna"],
  ["Nigerian Police Academy", "POLAC", "university", "Main Campus", "Wudil", "Kano"],
  ["Air Force Institute of Technology", "AFIT", "university", "Main Campus", "Kaduna", "Kaduna"],
  ["Nigerian Army University Biu", "NAUB", "university", "Main Campus", "Biu", "Borno"],
  ["National Open University of Nigeria", "NOUN", "university", "Headquarters", "Jabi", "FCT"],
  ["Joseph Sarwuan Tarka University, Makurdi", "UAM", "university", "Main Campus", "Makurdi", "Benue"],
  ["Federal University of Health Sciences, Otukpo", "FUHSO", "university", "Main Campus", "Otukpo", "Benue"],
  ["Federal University of Health Sciences, Azare", "FUHSA", "university", "Main Campus", "Azare", "Bauchi"],
  ["David Umahi Federal University of Health Sciences", "DUFUHS", "university", "Main Campus", "Uburu", "Ebonyi"],
  ["Federal University of Technology, Babura", "FUTB", "university", "Main Campus", "Babura", "Jigawa"],
  ["Admiralty University of Nigeria", "ADUN", "university", "Main Campus", "Ibusa", "Delta"],
  // STATE UNIVERSITIES
  ["Lagos State University", "LASU", "university", "Ojo Campus", "Ojo", "Lagos"],
  ["Lagos State University", "LASU", "university", "Epe Campus", "Epe", "Lagos"],
  ["Ambrose Alli University", "AAU", "university", "Main Campus", "Ekpoma", "Edo"],
  ["Adekunle Ajasin University", "AAUA", "university", "Main Campus", "Akungba-Akoko", "Ondo"],
  ["Ekiti State University", "EKSU", "university", "Main Campus", "Ado-Ekiti", "Ekiti"],
  ["Olabisi Onabanjo University", "OOU", "university", "Main Campus", "Ago-Iwoye", "Ogun"],
  ["Tai Solarin University of Education", "TASUED", "university", "Main Campus", "Ijagun", "Ogun"],
  ["Osun State University", "UNIOSUN", "university", "Osogbo Campus", "Osogbo", "Osun"],
  ["Ladoke Akintola University of Technology", "LAUTECH", "university", "Ogbomoso Campus", "Ogbomoso", "Oyo"],
  ["Ladoke Akintola University of Technology", "LAUTECH", "university", "Oyo Campus", "Oyo", "Oyo"],
  ["Kwara State University", "KWASU", "university", "Main Campus", "Malete", "Kwara"],
  ["Kogi State University", "KSU", "university", "Main Campus", "Anyigba", "Kogi"],
  ["Benue State University", "BSU", "university", "Main Campus", "Makurdi", "Benue"],
  ["Nasarawa State University", "NSUK", "university", "Main Campus", "Keffi", "Nasarawa"],
  ["Plateau State University", "PLASU", "university", "Main Campus", "Bokkos", "Plateau"],
  ["Abia State University", "ABSU", "university", "Main Campus", "Uturu", "Abia"],
  ["Imo State University", "IMSU", "university", "Main Campus", "Owerri", "Imo"],
  ["Enugu State University of Science and Technology", "ESUT", "university", "Main Campus", "Enugu", "Enugu"],
  ["Ebonyi State University", "EBSU", "university", "Main Campus", "Abakaliki", "Ebonyi"],
  ["Chukwuemeka Odumegwu Ojukwu University", "COOU", "university", "Uli Campus", "Uli", "Anambra"],
  ["Rivers State University", "RSU", "university", "Main Campus", "Port Harcourt", "Rivers"],
  ["Ignatius Ajuru University of Education", "IAUE", "university", "Main Campus", "Port Harcourt", "Rivers"],
  ["Delta State University", "DELSU", "university", "Abraka Campus", "Abraka", "Delta"],
  ["Akwa Ibom State University", "AKSU", "university", "Main Campus", "Ikot Akpaden", "Akwa Ibom"],
  ["Cross River University of Technology", "CRUTECH", "university", "Calabar Campus", "Calabar", "Cross River"],
  ["Bayelsa Medical University", "BMU", "university", "Main Campus", "Yenagoa", "Bayelsa"],
  ["Niger Delta University", "NDU", "university", "Main Campus", "Wilberforce Island", "Bayelsa"],
  ["Gombe State University", "GSU", "university", "Main Campus", "Gombe", "Gombe"],
  ["Bauchi State University", "BASUG", "university", "Main Campus", "Gadau", "Bauchi"],
  ["Yobe State University", "YSU", "university", "Main Campus", "Damaturu", "Yobe"],
  ["Borno State University", "BOSU", "university", "Main Campus", "Maiduguri", "Borno"],
  ["Kano University of Science and Technology", "KUST", "university", "Main Campus", "Wudil", "Kano"],
  ["Umaru Musa Yaradua University", "UMYU", "university", "Main Campus", "Katsina", "Katsina"],
  ["Kebbi State University of Science and Technology", "KSUSTA", "university", "Main Campus", "Aliero", "Kebbi"],
  ["Sokoto State University", "SSU", "university", "Main Campus", "Sokoto", "Sokoto"],
  ["Zamfara State University", "ZAMSUT", "university", "Main Campus", "Talata Mafara", "Zamfara"],
  ["Taraba State University", "TASU", "university", "Main Campus", "Jalingo", "Taraba"],
  ["Adamawa State University", "ADSU", "university", "Main Campus", "Mubi", "Adamawa"],
  ["Ibrahim Badamasi Babangida University", "IBBU", "university", "Main Campus", "Lapai", "Niger"],
  ["Confluence University of Science and Technology", "CUSTECH", "university", "Main Campus", "Osara", "Kogi"],
  ["Bamidele Olumilua University of Education, Science and Technology", "BOUESTI", "university", "Main Campus", "Ikere-Ekiti", "Ekiti"],
  ["University of Africa, Toru-Orua", "UAT", "university", "Main Campus", "Toru-Orua", "Bayelsa"],
  ["Edo State University", "EDSU", "university", "Main Campus", "Uzairue", "Edo"],
  ["First Technical University, Ibadan", "Tech-U", "university", "Main Campus", "Ibadan", "Oyo"],
  ["Moshood Abiola University of Science and Technology", "MAUSTECH", "university", "Main Campus", "Abeokuta", "Ogun"],
  // PRIVATE UNIVERSITIES
  ["Covenant University", "CU", "university", "Main Campus", "Ota", "Ogun"],
  ["Babcock University", "BU", "university", "Main Campus", "Ilishan-Remo", "Ogun"],
  ["Bowen University", "BUW", "university", "Main Campus", "Iwo", "Osun"],
  ["Redeemer's University", "RUN", "university", "Main Campus", "Ede", "Osun"],
  ["Landmark University", "LMU", "university", "Main Campus", "Omu-Aran", "Kwara"],
  ["Afe Babalola University", "ABUAD", "university", "Main Campus", "Ado-Ekiti", "Ekiti"],
  ["American University of Nigeria", "AUN", "university", "Main Campus", "Yola", "Adamawa"],
  ["Pan-Atlantic University", "PAU", "university", "Main Campus", "Ibeju-Lekki", "Lagos"],
  ["Caleb University", "Caleb", "university", "Main Campus", "Imota", "Lagos"],
  ["Chrisland University", "Chrisland", "university", "Main Campus", "Abeokuta", "Ogun"],
  ["Christopher University", "Christopher", "university", "Main Campus", "Mowe", "Ogun"],
  ["Ajayi Crowther University", "ACU", "university", "Main Campus", "Oyo", "Oyo"],
  ["Lead City University", "LCU", "university", "Main Campus", "Ibadan", "Oyo"],
  ["Joseph Ayo Babalola University", "JABU", "university", "Main Campus", "Ikeji-Arakeji", "Osun"],
  ["Oduduwa University", "OUI", "university", "Main Campus", "Ipetumodu", "Osun"],
  ["Fountain University", "FUO", "university", "Main Campus", "Osogbo", "Osun"],
  ["Kings University", "KU", "university", "Main Campus", "Odeomu", "Osun"],
  ["Adeleke University", "AU", "university", "Main Campus", "Ede", "Osun"],
  ["Achievers University", "AUO", "university", "Main Campus", "Owo", "Ondo"],
  ["Elizade University", "EU", "university", "Main Campus", "Ilara-Mokin", "Ondo"],
  ["Wesley University", "WUSTO", "university", "Main Campus", "Ondo", "Ondo"],
  ["Madonna University", "Madonna", "university", "Okija Campus", "Okija", "Anambra"],
  ["Madonna University", "Madonna", "university", "Elele Campus", "Elele", "Rivers"],
  ["Caritas University", "Caritas", "university", "Main Campus", "Amorji-Nike", "Enugu"],
  ["Godfrey Okoye University", "GOUNI", "university", "Main Campus", "Enugu", "Enugu"],
  ["Renaissance University", "RNU", "university", "Main Campus", "Ugbawka", "Enugu"],
  ["Gregory University", "GUU", "university", "Main Campus", "Uturu", "Abia"],
  ["Rhema University", "Rhema", "university", "Main Campus", "Aba", "Abia"],
  ["Clifford University", "Clifford", "university", "Main Campus", "Owerrinta", "Abia"],
  ["Evangel University", "Evangel", "university", "Main Campus", "Akaeze", "Ebonyi"],
  ["Hezekiah University", "Hezekiah", "university", "Main Campus", "Umudi", "Imo"],
  ["Arthur Jarvis University", "AJU", "university", "Main Campus", "Akpabuyo", "Cross River"],
  ["Topfaith University", "Topfaith", "university", "Main Campus", "Mkpatak", "Akwa Ibom"],
  ["PAMO University of Medical Sciences", "PUMS", "university", "Main Campus", "Port Harcourt", "Rivers"],
  ["Benson Idahosa University", "BIU", "university", "Main Campus", "Benin City", "Edo"],
  ["Igbinedion University", "IUO", "university", "Main Campus", "Okada", "Edo"],
  ["Wellspring University", "Wellspring", "university", "Main Campus", "Benin City", "Edo"],
  ["Western Delta University", "WDU", "university", "Main Campus", "Oghara", "Delta"],
  ["Novena University", "Novena", "university", "Main Campus", "Ogume", "Delta"],
  ["Edwin Clark University", "ECU", "university", "Main Campus", "Kiagbodo", "Delta"],
  ["Michael and Cecilia Ibru University", "MCIU", "university", "Main Campus", "Agbarha-Otor", "Delta"],
  ["Nile University of Nigeria", "Nile", "university", "Main Campus", "Abuja", "FCT"],
  ["Baze University", "Baze", "university", "Main Campus", "Abuja", "FCT"],
  ["Veritas University", "Veritas", "university", "Main Campus", "Abuja", "FCT"],
  ["African University of Science and Technology", "AUST", "university", "Main Campus", "Abuja", "FCT"],
  ["Philomath University", "Philomath", "university", "Main Campus", "Kuje", "FCT"],
  ["Al-Hikmah University", "Al-Hikmah", "university", "Main Campus", "Ilorin", "Kwara"],
  ["Summit University", "Summit", "university", "Main Campus", "Offa", "Kwara"],
  ["Thomas Adewumi University", "TAU", "university", "Main Campus", "Oko-Irese", "Kwara"],
  ["Bingham University", "Bingham", "university", "Main Campus", "Karu", "Nasarawa"],
  ["Salem University", "Salem", "university", "Main Campus", "Lokoja", "Kogi"],
  ["Kola Daisi University", "KDU", "university", "Main Campus", "Ibadan", "Oyo"],
  ["Dominican University", "Dominican", "university", "Main Campus", "Ibadan", "Oyo"],
  ["Atiba University", "Atiba", "university", "Main Campus", "Oyo", "Oyo"],
  ["Skyline University Nigeria", "SUN", "university", "Main Campus", "Kano", "Kano"],
  ["Mewar International University", "MIU", "university", "Main Campus", "Masaka", "Nasarawa"],
  ["Greenfield University", "Greenfield", "university", "Main Campus", "Kaduna", "Kaduna"],
  ["Karl Kumm University", "KKU", "university", "Main Campus", "Vom", "Plateau"],
  ["Anan University", "ANAN", "university", "Main Campus", "Kwall", "Plateau"],
  // POLYTECHNICS
  ["Yaba College of Technology", "YABATECH", "polytechnic", "Main Campus", "Yaba", "Lagos"],
  ["Federal Polytechnic, Ado-Ekiti", "FEDPOLYADO", "polytechnic", "Main Campus", "Ado-Ekiti", "Ekiti"],
  ["Federal Polytechnic, Auchi", "Auchi Poly", "polytechnic", "Main Campus", "Auchi", "Edo"],
  ["Federal Polytechnic, Bauchi", "FPTB", "polytechnic", "Main Campus", "Bauchi", "Bauchi"],
  ["Federal Polytechnic, Bida", "FPB", "polytechnic", "Main Campus", "Bida", "Niger"],
  ["Federal Polytechnic, Damaturu", "FEDPODAM", "polytechnic", "Main Campus", "Damaturu", "Yobe"],
  ["Federal Polytechnic, Ede", "FEDPOLY Ede", "polytechnic", "Main Campus", "Ede", "Osun"],
  ["Federal Polytechnic, Idah", "FEDPOLY Idah", "polytechnic", "Main Campus", "Idah", "Kogi"],
  ["Federal Polytechnic, Ilaro", "FEDPOLY Ilaro", "polytechnic", "Main Campus", "Ilaro", "Ogun"],
  ["Federal Polytechnic, Kaura Namoda", "FEDPOLY KN", "polytechnic", "Main Campus", "Kaura Namoda", "Zamfara"],
  ["Federal Polytechnic, Mubi", "FEDPOLY Mubi", "polytechnic", "Main Campus", "Mubi", "Adamawa"],
  ["Federal Polytechnic, Nasarawa", "FEDPOLY Nasarawa", "polytechnic", "Main Campus", "Nasarawa", "Nasarawa"],
  ["Federal Polytechnic, Nekede", "FPNO", "polytechnic", "Main Campus", "Nekede", "Imo"],
  ["Federal Polytechnic, Offa", "FEDPOFFA", "polytechnic", "Main Campus", "Offa", "Kwara"],
  ["Federal Polytechnic, Oko", "FEDPOLY Oko", "polytechnic", "Main Campus", "Oko", "Anambra"],
  ["Federal Polytechnic, Bali", "FEDPOLY Bali", "polytechnic", "Main Campus", "Bali", "Taraba"],
  ["Federal Polytechnic, Ekowe", "FEDPOLY Ekowe", "polytechnic", "Main Campus", "Ekowe", "Bayelsa"],
  ["Federal Polytechnic, Ile-Oluji", "FEDPOLY Ile-Oluji", "polytechnic", "Main Campus", "Ile-Oluji", "Ondo"],
  ["Federal Polytechnic, Ukana", "FEDPOLY Ukana", "polytechnic", "Main Campus", "Ukana", "Akwa Ibom"],
  ["Federal Polytechnic, Wannune", "FEDPOLY Wannune", "polytechnic", "Main Campus", "Wannune", "Benue"],
  ["Kaduna Polytechnic", "KADPOLY", "polytechnic", "Main Campus", "Kaduna", "Kaduna"],
  ["Akanu Ibiam Federal Polytechnic, Unwana", "AIFPU", "polytechnic", "Main Campus", "Unwana", "Ebonyi"],
  ["Hussaini Adamu Federal Polytechnic", "HAFEDPOLY", "polytechnic", "Main Campus", "Kazaure", "Jigawa"],
  ["Lagos State University of Science and Technology", "LASUSTECH", "polytechnic", "Ikorodu Campus", "Ikorodu", "Lagos"],
  ["Moshood Abiola Polytechnic", "MAPOLY", "polytechnic", "Main Campus", "Abeokuta", "Ogun"],
  ["Rufus Giwa Polytechnic", "RUGIPO", "polytechnic", "Main Campus", "Owo", "Ondo"],
  ["The Polytechnic, Ibadan", "Poly Ibadan", "polytechnic", "Main Campus", "Ibadan", "Oyo"],
  ["Kwara State Polytechnic", "KWARAPOLY", "polytechnic", "Main Campus", "Ilorin", "Kwara"],
  ["Osun State Polytechnic", "OSPOLY", "polytechnic", "Main Campus", "Iree", "Osun"],
  ["Osun State College of Technology", "OSCOTECH", "polytechnic", "Main Campus", "Esa-Oke", "Osun"],
  ["Delta State Polytechnic, Ogwashi-Uku", "DSPG", "polytechnic", "Main Campus", "Ogwashi-Uku", "Delta"],
  ["Delta State Polytechnic, Ozoro", "DSPZ", "polytechnic", "Main Campus", "Ozoro", "Delta"],
  ["Imo State Polytechnic", "IMOPOLY", "polytechnic", "Main Campus", "Umuagwo", "Imo"],
  ["Abia State Polytechnic", "ABIAPOLY", "polytechnic", "Main Campus", "Aba", "Abia"],
  ["Captain Elechi Amadi Polytechnic", "CAPTECH", "polytechnic", "Main Campus", "Port Harcourt", "Rivers"],
  ["Kenule Beeson Saro-Wiwa Polytechnic", "KENPOLY", "polytechnic", "Main Campus", "Bori", "Rivers"],
  ["Akwa Ibom State Polytechnic", "AKWAIBOMPOLY", "polytechnic", "Main Campus", "Ikot Osurua", "Akwa Ibom"],
  ["Institute of Management and Technology, Enugu", "IMT", "polytechnic", "Main Campus", "Enugu", "Enugu"],
  ["Kogi State Polytechnic", "KSP", "polytechnic", "Main Campus", "Lokoja", "Kogi"],
  ["Nasarawa State Polytechnic", "NASPOLY", "polytechnic", "Main Campus", "Lafia", "Nasarawa"],
  ["Plateau State Polytechnic", "PLAPOLY", "polytechnic", "Main Campus", "Barkin Ladi", "Plateau"],
  ["Benue State Polytechnic", "BENPOLY", "polytechnic", "Main Campus", "Ugbokolo", "Benue"],
  ["Nuhu Bamalli Polytechnic", "NUBAPOLY", "polytechnic", "Main Campus", "Zaria", "Kaduna"],
  ["Hassan Usman Katsina Polytechnic", "HUKPOLY", "polytechnic", "Main Campus", "Katsina", "Katsina"],
  ["Kano State Polytechnic", "KANOPOLY", "polytechnic", "Main Campus", "Kano", "Kano"],
  ["Jigawa State Polytechnic", "JIGPOLY", "polytechnic", "Main Campus", "Dutse", "Jigawa"],
  ["Gateway ICT Polytechnic", "GAPOSA", "polytechnic", "Main Campus", "Saapade", "Ogun"],
  ["Abraham Adesanya Polytechnic", "AAPOLY", "polytechnic", "Main Campus", "Ijebu-Igbo", "Ogun"],
  ["D.S. Adegbenro ICT Polytechnic", "DSA-ICTPOLY", "polytechnic", "Main Campus", "Itori", "Ogun"],
  ["Edo State Polytechnic", "EDOPOLY", "polytechnic", "Main Campus", "Usen", "Edo"],
  // COLLEGES OF EDUCATION
  ["Federal College of Education (Technical), Akoka", "FCET Akoka", "college_of_education", "Main Campus", "Akoka", "Lagos"],
  ["Federal College of Education, Abeokuta", "FCE Abeokuta", "college_of_education", "Main Campus", "Abeokuta", "Ogun"],
  ["Federal College of Education, Okene", "FCE Okene", "college_of_education", "Main Campus", "Okene", "Kogi"],
  ["Federal College of Education, Pankshin", "FCE Pankshin", "college_of_education", "Main Campus", "Pankshin", "Plateau"],
  ["Federal College of Education, Katsina", "FCE Katsina", "college_of_education", "Main Campus", "Katsina", "Katsina"],
  ["Federal College of Education, Zaria", "FCE Zaria", "college_of_education", "Main Campus", "Zaria", "Kaduna"],
  ["Federal College of Education, Kano", "FCE Kano", "college_of_education", "Main Campus", "Kano", "Kano"],
  ["Federal College of Education, Kontagora", "FCE Kontagora", "college_of_education", "Main Campus", "Kontagora", "Niger"],
  ["Federal College of Education, Obudu", "FCE Obudu", "college_of_education", "Main Campus", "Obudu", "Cross River"],
  ["Federal College of Education, Omoku", "FCE Omoku", "college_of_education", "Main Campus", "Omoku", "Rivers"],
  ["Federal College of Education, Yola", "FCE Yola", "college_of_education", "Main Campus", "Yola", "Adamawa"],
  ["Federal College of Education (Special), Oyo", "FCE Special Oyo", "college_of_education", "Main Campus", "Oyo", "Oyo"],
  ["Federal College of Education, Eha-Amufu", "FCE Eha-Amufu", "college_of_education", "Main Campus", "Eha-Amufu", "Enugu"],
  ["Adeyemi College of Education", "ACE", "college_of_education", "Main Campus", "Ondo", "Ondo"],
  ["Alvan Ikoku Federal College of Education", "AIFCE", "college_of_education", "Main Campus", "Owerri", "Imo"],
  ["Adeniran Ogunsanya College of Education", "AOCOED", "college_of_education", "Main Campus", "Otto/Ijanikin", "Lagos"],
  ["Michael Otedola College of Primary Education", "MOCPED", "college_of_education", "Main Campus", "Noforija", "Lagos"],
  ["Emmanuel Alayande College of Education", "EACOED", "college_of_education", "Main Campus", "Oyo", "Oyo"],
  ["Osun State College of Education, Ila-Orangun", "OSSCE", "college_of_education", "Main Campus", "Ila-Orangun", "Osun"],
  ["College of Education, Ikere-Ekiti", "COE Ikere", "college_of_education", "Main Campus", "Ikere-Ekiti", "Ekiti"],
  ["College of Education, Warri", "COE Warri", "college_of_education", "Main Campus", "Warri", "Delta"],
  ["College of Education, Agbor", "COE Agbor", "college_of_education", "Main Campus", "Agbor", "Delta"],
  ["Nwafor Orizu College of Education", "NOCEN", "college_of_education", "Main Campus", "Nsugbe", "Anambra"],
  ["Enugu State College of Education (Technical)", "ESCET", "college_of_education", "Main Campus", "Enugu", "Enugu"],
  ["Isa Kaita College of Education", "IKCOE", "college_of_education", "Main Campus", "Dutsin-Ma", "Katsina"],
  ["Sa'adatu Rimi College of Education", "SRCOE", "college_of_education", "Main Campus", "Kumbotso", "Kano"],
  ["College of Education, Gidan Waya", "COE Gidan Waya", "college_of_education", "Main Campus", "Gidan Waya", "Kaduna"],
  ["Kashim Ibrahim College of Education", "KICOE", "college_of_education", "Main Campus", "Maiduguri", "Borno"],
  ["College of Education, Hong", "COE Hong", "college_of_education", "Main Campus", "Hong", "Adamawa"],
  ["College of Education, Akwanga", "COE Akwanga", "college_of_education", "Main Campus", "Akwanga", "Nasarawa"],
  ["College of Education, Katsina-Ala", "COE Katsina-Ala", "college_of_education", "Main Campus", "Katsina-Ala", "Benue"],
  // COLLEGES / MONOTECHNICS
  ["Federal College of Animal Health and Production Technology, Ibadan", "FCAHPT", "monotechnic", "Main Campus", "Ibadan", "Oyo"],
  ["Federal College of Forestry, Ibadan", "FCF Ibadan", "monotechnic", "Main Campus", "Ibadan", "Oyo"],
  ["Federal College of Fisheries and Marine Technology", "FCFFMT", "monotechnic", "Main Campus", "Victoria Island", "Lagos"],
  ["Federal College of Orthopaedic Technology", "FECOT", "monotechnic", "Main Campus", "Igbobi", "Lagos"],
  ["Nigerian College of Aviation Technology", "NCAT", "monotechnic", "Main Campus", "Zaria", "Kaduna"],
  ["Maritime Academy of Nigeria", "MAN", "monotechnic", "Main Campus", "Oron", "Akwa Ibom"],
  ["Petroleum Training Institute", "PTI", "monotechnic", "Main Campus", "Effurun", "Delta"],
  ["Federal School of Surveying", "FSS", "monotechnic", "Main Campus", "Oyo", "Oyo"],
  ["National Institute for Nigerian Languages", "NINLAN", "college", "Main Campus", "Aba", "Abia"],
  ["College of Health Technology, Ijero", "CHT Ijero", "college", "Main Campus", "Ijero", "Ekiti"],
  ["School of Nursing, UCH Ibadan", "SON UCH", "college", "Main Campus", "Ibadan", "Oyo"],
  ["Lagos University Teaching Hospital School of Nursing", "LUTH SON", "college", "Main Campus", "Idi-Araba", "Lagos"],
  ["College of Nursing Sciences, UMTH", "CON UMTH", "college", "Main Campus", "Maiduguri", "Borno"],
  // SECONDARY / UNITY SCHOOLS (starter set — request flow covers the rest)
  ["Federal Government College, Ijanikin", "FGC Ijanikin", "secondary_school", "Main Campus", "Ijanikin", "Lagos"],
  ["Federal Government College, Odogbolu", "FGC Odogbolu", "secondary_school", "Main Campus", "Odogbolu", "Ogun"],
  ["Federal Government College, Ikot Ekpene", "FGC Ikot Ekpene", "secondary_school", "Main Campus", "Ikot Ekpene", "Akwa Ibom"],
  ["Federal Government College, Warri", "FGC Warri", "secondary_school", "Main Campus", "Warri", "Delta"],
  ["Federal Government College, Enugu", "FGC Enugu", "secondary_school", "Main Campus", "Enugu", "Enugu"],
  ["Federal Government College, Jos", "FGC Jos", "secondary_school", "Main Campus", "Jos", "Plateau"],
  ["Federal Government College, Kaduna", "FGC Kaduna", "secondary_school", "Main Campus", "Kaduna", "Kaduna"],
  ["Federal Government College, Kano", "FGC Kano", "secondary_school", "Main Campus", "Kano", "Kano"],
  ["Federal Government College, Maiduguri", "FGC Maiduguri", "secondary_school", "Main Campus", "Maiduguri", "Borno"],
  ["Federal Government College, Okigwe", "FGC Okigwe", "secondary_school", "Main Campus", "Okigwe", "Imo"],
  ["Federal Government College, Ogbomoso", "FGC Ogbomoso", "secondary_school", "Main Campus", "Ogbomoso", "Oyo"],
  ["Federal Government College, Port Harcourt", "FGC PH", "secondary_school", "Main Campus", "Port Harcourt", "Rivers"],
  ["Federal Government College, Ilorin", "FGC Ilorin", "secondary_school", "Main Campus", "Ilorin", "Kwara"],
  ["Federal Government College, Azare", "FGC Azare", "secondary_school", "Main Campus", "Azare", "Bauchi"],
  ["Federal Government Girls College, Oyo", "FGGC Oyo", "secondary_school", "Main Campus", "Oyo", "Oyo"],
  ["Federal Government Girls College, Abuloma", "FGGC Abuloma", "secondary_school", "Main Campus", "Port Harcourt", "Rivers"],
  ["King's College, Lagos", "KC Lagos", "secondary_school", "Main Campus", "Lagos Island", "Lagos"],
  ["Queen's College, Lagos", "QC Lagos", "secondary_school", "Main Campus", "Yaba", "Lagos"],
  ["Government College, Ibadan", "GCI", "secondary_school", "Main Campus", "Ibadan", "Oyo"],
  ["Christ's School, Ado-Ekiti", "Christ's School", "secondary_school", "Main Campus", "Ado-Ekiti", "Ekiti"],
  ["St. Gregory's College, Lagos", "St. Gregory", "secondary_school", "Main Campus", "Ikoyi", "Lagos"],
  ["Loyola Jesuit College", "LJC", "secondary_school", "Main Campus", "Abuja", "FCT"],
  ["Whitesands School", "Whitesands", "secondary_school", "Main Campus", "Lekki", "Lagos"],
  ["Atlantic Hall", "Atlantic Hall", "secondary_school", "Main Campus", "Epe", "Lagos"],
  ["Day Waterman College", "DWC", "secondary_school", "Main Campus", "Abeokuta", "Ogun"],
  ["Corona Secondary School", "Corona", "secondary_school", "Main Campus", "Agbara", "Ogun"],
];

const instMap = new Map();
for (const [name, short_name, type, campus, city, state] of rows) {
  if (!instMap.has(name)) instMap.set(name, { name, short_name, type, campuses: [] });
  const inst = instMap.get(name);
  if (!inst.campuses.some((c) => c.campus === campus)) {
    inst.campuses.push({ campus, city, state });
  }
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const values = [];
for (const inst of instMap.values()) {
  for (const c of inst.campuses) {
    values.push(
      `('${esc(inst.name)}','${esc(inst.short_name)}','${esc(inst.type)}','${esc(c.campus)}','${esc(c.city)}','${esc(c.state)}')`,
    );
  }
}

const valuesBlock = values.join(",\n");

const sql = `-- Seed Nigerian institutions and campuses for CampusOS school picker
-- Generated by scripts/generate-nigerian-institutions-seed.mjs

with seed(name, short_name, institution_type, campus_name, city, state) as (
  values
${valuesBlock}
)
insert into public.institutions (name, short_name, institution_type)
select distinct on (lower(s.name)) s.name, s.short_name, s.institution_type
from seed s
where not exists (
  select 1 from public.institutions i where lower(i.name) = lower(s.name)
)
order by lower(s.name);

with seed(name, short_name, institution_type, campus_name, city, state) as (
  values
${valuesBlock}
)
insert into public.campuses (institution_id, name, city, state)
select i.id, s.campus_name, s.city, s.state
from seed s
join public.institutions i on lower(i.name) = lower(s.name)
where not exists (
  select 1 from public.campuses c
  where c.institution_id = i.id and lower(c.name) = lower(s.campus_name)
);
`;

const out = "d:/campus-os/supabase/migrations/20261113010001_phase_nigerian_institutions_seed.sql";
fs.writeFileSync(out, sql);
console.log(`Wrote ${out}`);
console.log(`institutions=${instMap.size} campus_rows=${values.length}`);
