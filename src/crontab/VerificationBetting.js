const { betting, events, rounds, users} = require('../db');
const { fn,col, or } = require('sequelize');

const updateBetStatus = async (bets, status) => {
    // Crear un array de promesas para las actualizaciones
    const updatePromises = bets.map(bet => 
        betting.update({ status }, { where: { id: bet.id } })
    );

    // Esperar a que todas las promesas se resuelvan
    try {
        await Promise.all(updatePromises);
        console.log('Todas las apuestas han sido actualizadas.');
    } catch (error) {
        console.error('Error al actualizar apuestas:', error);
    }
};


const updateUserBalance = async (user, amount) => {
    try {
        // Buscar los datos del usuario
        const userData = await users.findOne({ where: { id: user } });

        // Verificar si el usuario existe
        if (!userData) {
            console.error(`Usuario ID: ${user} no encontrado.`);
            return;
        }

        const newBalance = userData.initial_balance + amount;
        console.log(`Devolviendo saldo al usuario ID: ${user}. Saldo anterior: ${userData.initial_balance}, Nuevo saldo: ${newBalance}`);

        // Actualizar el saldo del usuario
        await users.update(
            { initial_balance: newBalance },
            { where: { id: user } }
        );

        console.log(`Saldo actualizado para el usuario ID: ${user}. Nuevo saldo: ${newBalance}`);
    } catch (error) {
        console.error('Error al actualizar el saldo del usuario:', error);
    }
};


// Función que genera todas las combinaciones de sumas de 2 o más elementos de un array
function obtenerSumasCombinadasConIds(arr) {
    const sumas = new Map(); // Usamos un Map para almacenar la suma y las IDs involucradas

    for (let i = 1; i <= arr.length; i++) { // Combinaciones de 1 o más elementos
        const generarCombinaciones = (start, combo, ids) => {
            if (combo.length === i) {
                const suma = combo.reduce((acc, val) => acc + val, 0);
                sumas.set(suma, [...(sumas.get(suma) || []), ids]);
                return;
            }

            for (let j = start; j < arr.length; j++) {
                generarCombinaciones(j + 1, [...combo, arr[j].amount], [...ids, arr[j].id]);
            }
        };

        generarCombinaciones(0, [], []);
    }

    return sumas;
}

function encontrarSumaComunConIds(array1, array2) {
    const sumasArray1 = obtenerSumasCombinadasConIds(array1);
    const sumasArray2 = obtenerSumasCombinadasConIds(array2);

    let resultado = [];

    // Buscar la suma común más alta y devolver los IDs combinados
    for (const [suma, combinaciones1] of sumasArray1.entries()) {
        if (sumasArray2.has(suma)) {
            const combinaciones2 = sumasArray2.get(suma);
            // Combinar las IDs de ambas combinaciones que logran la suma
            combinaciones1.forEach(ids1 => {
                combinaciones2.forEach(ids2 => {
                    resultado = [...ids1, ...ids2];
                });
            });
            break; // Nos quedamos con la primera coincidencia
        }
    }

    return resultado;
}

const evaluateGroupBet = async (redBets, greenBets, io) => {
    const redAmounts = redBets.map(bet => ({ amount: bet.amount, id: bet.id }));
    const greenAmounts = greenBets.map(bet => ({ amount: bet.amount, id: bet.id }));

    const resultado = encontrarSumaComunConIds(redAmounts, greenAmounts);
    console.log(resultado);

    if (resultado.length > 0) {
        for (const betId of resultado) {
            await betting.update({ status: 1 }, { where: { id: betId } });

            const updatedRedBet = await betting.findOne({ where: { id: betId } });
            const updatedGreenBet = await betting.findOne({ where: { id: betId } });

            io.emit("Statusbetting", {
                status: "accepted",
                redBet: updatedRedBet,
                greenBet: updatedGreenBet,
                message: `Su apuesta de $${updatedRedBet.amount || updatedGreenBet.amount} se realizo con éxito`
            });
        }
    }
};

/*
const evaluateGroupBet = async (redBets, greenBets, io) => {
    let auxAmount = 0;
    let auxArray = [];
    for (let i = 0; i < redBets.length; i++) {
        auxAmount=redBets[i].amount;
        for (let j = 0; j < greenBets.length; j++) {
            if(auxAmount !== 0){
                if(redBets[i].amount > greenBets[j].amount){
                    auxAmount -= greenBets[j].amount;
                    auxArray.push(greenBets[j]);
                    greenBets.filter(bet => bet.id !== greenBets[j].id);
                }else if(redBets[i].amount < greenBets[j].amount){
                    auxAmount = greenBets[j].amount - redBets[i].amount;
                    auxArray.push(redBets[i]);
                    redBets.filter(bet => bet.id !== redBets[j].id);
                }
                
                console.log(auxArray)
                console.log(auxAmount)
            }else{
                auxArray.push(redBets[i]);
                await updateBetStatus(auxArray, 1);
                if(io){
                    io.emit('Statusbetting', {
                        status: "accepted",
                        message: `Su apuesta de $${redBets[i].amount} se realizó con éxito`
                    })
                }
                break;
            }
        }
        
    }
};
*/

const evaluateBetsAmountEquels = async (id_round, io) => {
    try {
        console.log(`Evaluando apuestas para la ronda ID: ${id_round}`);

        // Obtener todas las apuestas pendientes de ambos equipos en una sola consulta
        const bets = await betting.findAll({
            where: {
                id_round: id_round,
                status: 0 // Solo pendientes
            },
            attributes: ['id', 'amount', 'team'] // Seleccionar solo los campos necesarios
        });

        // Filtrar las apuestas por equipo
        let redBetsArray = bets.filter(bet => bet.team === 'red').map(bet => ({ id: bet.id, amount: bet.amount }));
        let greenBetsArray = bets.filter(bet => bet.team === 'green').map(bet => ({ id: bet.id, amount: bet.amount }));
    
        // Ordenar las apuestas por amount de mayor a menor
        redBetsArray.sort((a, b) => b.amount - a.amount);
        greenBetsArray.sort((a, b) => b.amount - a.amount);
        
        // Recorrer las apuestas del equipo rojo y buscar en el equipo verde
        for (const redBet of redBetsArray) {
            const matchingBet = greenBetsArray.find(greenBet => greenBet.amount === redBet.amount);

            if (matchingBet) {
                console.log(`Se encontró una apuesta igual: Rojo ID ${redBet.id} (${redBet.amount}) <-> Verde ID ${matchingBet.id} (${matchingBet.amount})`);
                await updateBetStatus([redBet], 1);
                await updateBetStatus([matchingBet], 1);
        
                // Eliminar la apuesta verde encontrada para evitar duplicados en futuras búsquedas
                greenBetsArray = greenBetsArray.filter(greenBet => greenBet.id !== matchingBet.id);
                const updatedRedBet = await betting.findOne({ where: { id: redBet.id } });
                const updatedGreenBet = await betting.findOne({ where: { id: matchingBet.id } });
                if(io){
                    io.emit('Statusbetting', {
                        status: "accepted",
                        redBet: updatedRedBet,
                        greenBet: updatedGreenBet,
                        message: `Su apuesta de $${redBet.amount} se realizó con éxito`
                    })
                }
            }
        }

        const bets2 = await betting.findAll({
            where: {
                id_round: id_round,
                status: 0 // Solo pendientes
            },
            attributes: ['id', 'amount', 'team'],
            order: [['amount', 'DESC']]
        });

        // Filtrar las apuestas por equipo
        redBetsArray = bets2.filter(bet => bet.team === 'red').map(bet => ({ id: bet.id, amount: bet.amount }));
        greenBetsArray = bets2.filter(bet => bet.team === 'green').map(bet => ({ id: bet.id, amount: bet.amount }));
        
        if (redBetsArray.length > 0 && greenBetsArray.length > 0) {
            let result = await evaluateGroupBet(redBetsArray, greenBetsArray, io);
            return result;
        }
    } catch (error) {
        console.log('Error en evaluateBetsAmountEquels:', error);
    }
   
    
};

const evaluateBetsRound = async (id_round, io) => {
    try {
        await evaluateBetsAmountEquels(id_round, io);
    // Obtener todas las apuestas de la ronda actual con status 0 (en proceso)
        const teamBets = await betting.findAll({
            where: {
                id_round: id_round,
                status: 0// Apuestas pendientes
            }
        });

        const results = await betting.findAll({
            attributes: [
                'team', // Agrupar por equipo
                [fn('SUM', col('amount')), 'totalAmount'] // Sumar los montos
            ],
            where: {
                status: 1
            },
            group: ['team'] // Agrupar por el campo 'team'
        });
        
        if (results[0].totalAmount === results[1].totalAmount) {
            for (const bet of teamBets) {
                await updateBetStatus([bet], 2);
                await updateUserBalance(bet.id_user, bet.amount);

                io.emit('Statusbetting', {
                    status: "rejected",
                    redBet: bet,
                    greenBet: bet,
                    message: `Su apuesta de $${bet.amount} fue declinada`
                });
            }
        }
    } catch (error) {
        io.emit('Statusbetting', {
            status: "error",
            message: error
        });
    }
};

exports.VerificationBetting = async (io) => {
    try {
        const activeEvent = await events.findOne({ where: { is_active: true } });

        if (!activeEvent) {
            let result ={
                event:'Statusbetting',
                data:{ id: 0, amount: 0, status: "No hay eventos activos" }
            } 
            return result;
        }

        const activeRounds = await rounds.findAll({ where: { id_event: activeEvent.id, is_betting_active: true } });

        if (!activeRounds.length) {
            let result ={
                event:'Statusbetting',
                data:{ id: 0, amount: 0, status: "No hay rondas activas" }
            }
            return result;
        }
        for (const round of activeRounds) {
            await evaluateBetsAmountEquels(round.id, io);
        }
    } catch (error) {
        let result ={
            event:'Statusbetting',
            data:{
                status: "error",
                message: error
            }
        } 
        return result;
    }
};

exports.VerificationBettingRound = async (id_round,io) => {
    try {
        if(id_round){
            await evaluateBetsRound(id_round, io);
        }
    } catch (error) {
        console.error('Error in VerificationBetting:', error);
    }
}
